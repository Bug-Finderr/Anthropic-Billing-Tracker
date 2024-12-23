const ALARM_NAME = "scrapeAnthropicBilling";
const ANTHROPIC_BILLING_URL = "https://console.anthropic.com/settings/billing";

let sortedBalanceThresholds = [];

// Listen for the alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("Alarm triggered: Scraping Anthropic billing data...");
    scrapeAndHandleData();
  }
});

// Function to scrape data and handle Slack notifications
function scrapeAndHandleData() {
  // Retrieve Slack Webhook URL and Balance Thresholds from storage
  chrome.storage.local.get(
    ["slackWebhookUrl", "balanceThresholds"],
    (result) => {
      const SLACK_WEBHOOK_URL = result.slackWebhookUrl;
      const balanceThresholds = result.balanceThresholds;

      if (!balanceThresholds || balanceThresholds.length === 0) {
        console.warn(
          "No balance thresholds set. Using default 60 minutes interval."
        );
      } else {
        // Sort and store thresholds once
        sortedBalanceThresholds = [...balanceThresholds].sort(
          (a, b) => a.limit - b.limit
        );
      }

      chrome.tabs.create(
        { url: ANTHROPIC_BILLING_URL, active: false },
        (tab) => {
          console.log(`Opened tab (ID: ${tab.id}) to scrape billing data.`);

          // Listener for messages from content script
          const messageListener = (request, sender, sendResponse) => {
            if (request.action === "billingDataScraped") {
              console.log(
                "Billing data received from content script: ",
                request.data
              );
              chrome.runtime.onMessage.removeListener(messageListener);
              chrome.tabs.remove(tab.id, () =>
                console.log(`Closed tab (ID: ${tab.id}).`)
              );

              const balance = request.data.creditBalance; // Format (string): "US$123.45"
              const remainingBalance = Number(
                balance.replace(/[^0-9.]/g, "")
              ).toFixed(2); // Format (number): 123.45

              if (isNaN(remainingBalance)) {
                console.warn(
                  `Parsed balance is NaN. Received raw balance: "${balance}"`
                );
                if (SLACK_WEBHOOK_URL) {
                  sendToSlack(
                    SLACK_WEBHOOK_URL,
                    `:alert: *Anthropic Billing Tracker Error*\n\n` +
                      `Unable to parse balance value.\n` +
                      `• Raw balance received: \`${balance}\`\n` +
                      `• Time: \`${new Date().toLocaleString()}\`\n` +
                      `• Please check your balance and update the extension settings.`
                  );
                }
                return;
              }

              console.log(`Remaining Balance: ${balance}`);

              const currentTime = Date.now();
              const logEntry = {
                sno: currentTime, // Using timestamp as serial number
                balance: balance,
                timestamp: new Date(currentTime).toLocaleString(),
              };

              // Update scrape logs
              chrome.storage.local.get(["scrapeLogs"], (res) => {
                let logs = res.scrapeLogs || [];
                logs.push(logEntry);

                // Maintain only the latest 100 logs
                if (logs.length > 100) logs = logs.slice(-100);

                chrome.storage.local.set({ scrapeLogs: logs }, () => {
                  console.log("Scrape log updated.");
                  // Notify extension once after all updates
                  updateAndNotify();
                });
              });

              // Update last scrape info
              chrome.storage.local.set(
                {
                  lastBalance: remainingBalance,
                  lastScrapeTime: currentTime,
                },
                () => {
                  console.log(
                    `Last scrape information updated. Timestamp: ${currentTime}`
                  );
                  // Notify extension once after all updates
                  updateAndNotify();
                }
              );

              // Determine next scrape interval based on balance
              const nextInterval = determineNextInterval(remainingBalance);
              const expectedNextScrapeTime = new Date(
                currentTime + nextInterval * 60000
              ).toLocaleString();

              chrome.storage.local.set(
                {
                  nextScrapeInterval: nextInterval,
                  nextScrapeTime: expectedNextScrapeTime,
                },
                () => {
                  console.log(
                    `Next scrape info updated. Timestamp: ${currentTime}`
                  );
                  // Notify extension once after all updates
                  updateAndNotify();
                }
              );

              // Send alert if applicable
              if (SLACK_WEBHOOK_URL)
                checkAndNotify(remainingBalance, SLACK_WEBHOOK_URL);
              else
                console.warn("No Slack Webhook URL found. Alerting skipped.");

              // Set the next alarm
              setAlarm(nextInterval);
            }
          };

          chrome.runtime.onMessage.addListener(messageListener);
        }
      );
    }
  );
}

// Function to determine next scrape interval based on balance and pre-sorted thresholds
function determineNextInterval(balance) {
  for (let threshold of sortedBalanceThresholds) {
    if (balance <= threshold.limit) return threshold.interval;
  }
  return 60; // Default to 60 minutes if no threshold matched
}

// Function to check balance against thresholds and notify Slack
function checkAndNotify(balance, webhookUrl) {
  if (sortedBalanceThresholds.length === 0) {
    const msg =
      `:warning: *Anthropic Billing Tracker Warning*\n\n` +
      `No balance thresholds are configured.\n` +
      `• Current Balance: \`$${balance}\`\n` +
      `• Time: \`${new Date().toLocaleString()}\`\n` +
      `• Default interval: \`60 minutes\`\n\n` +
      `_Please configure thresholds in the extension settings._`;
    sendToSlack(webhookUrl, msg);
    return;
  }

  for (let threshold of sortedBalanceThresholds) {
    if (balance <= threshold.limit) {
      // Send alert
      const msg =
        `:alert: *Anthropic Billing Alert*\n\n` +
        `Your credit balance is running low!\n\n` +
        `• Current Balance: \`$${balance}\`\n` +
        `• Time: \`${new Date().toLocaleString()}\`\n\n` +
        `_Please top up your credits to avoid service interruption._`;
      sendToSlack(webhookUrl, msg);
      console.log(
        `Alert sent for threshold: $${threshold.limit}\nBalance: ${balance}`
      );
      // Exit after handling the first matching threshold
      return;
    }
  }

  // If balance is above all thresholds, no alert needed
  console.log("No alert needed. Balance is above all thresholds.");
}

// Function to set the next scrape alarm
function setAlarm(intervalInMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalInMinutes });
    console.log(`Alarm set to trigger in ${intervalInMinutes} minutes.`);
  });
}

// Function to send messages to Slack
function sendToSlack(webhookUrl, message) {
  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: message,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Slack Webhook Error: ${response.statusText}`);
      }
      console.log("Message sent to Slack successfully.");
    })
    .catch((error) => {
      console.error("Error sending message to Slack:", error);
    });
}

// Function to update and notify extension
function updateAndNotify() {
  // To prevent multiple notifications in quick succession, you might want to implement a debounce mechanism here.
  // For simplicity, we'll call notifyExtension once after all updates.
  notifyExtension();
}

// Function to notify popup and options page to refresh data
function notifyExtension() {
  chrome.runtime.sendMessage({ action: "updateData" });
}

// Handle manual scrape requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualScrape") {
    console.log("Manual scrape triggered.");
    scrapeAndHandleData();
    sendResponse({ status: "success" });
  }
});

// Initial message after extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log(
    "Anthropic Billing Tracker Extension Installed.\nPlease configure at least one balance threshold and click `Manual Scrape` in the popup to start scraping."
  );

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Anthropic Billing Tracker Installed",
    message:
      "Please configure at least one balance threshold and click `Manual Scrape` in the popup to start scraping.",
  });
});
