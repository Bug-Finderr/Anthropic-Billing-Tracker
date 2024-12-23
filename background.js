const ALARM_NAME = "scrapeAnthropicBilling";
const ANTHROPIC_BILLING_URL = "https://console.anthropic.com/settings/billing";

// Listen for the alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("Alarm triggered: Scraping Anthropic billing data...");
    scrapeAndSendData();
  }
});

// Function to scrape data and send to Slack
function scrapeAndSendData() {
  // Retrieve Slack Webhook URL and Balance Thresholds from storage
  chrome.storage.local.get(
    ["slackWebhookUrl", "balanceThresholds"],
    (result) => {
      const SLACK_WEBHOOK_URL = result.slackWebhookUrl;
      const balanceThresholds = result.balanceThresholds;

      if (!balanceThresholds || balanceThresholds.length === 0) {
        console.warn("No balance thresholds set. Scraping is skipped.");
        return;
      }

      if (!SLACK_WEBHOOK_URL) {
        console.warn(
          "Slack Webhook URL not set. Please configure it in the popup."
        );
        // Still proceed to scrape and log the balance
        scrapeBalanceAndLog();
        return;
      }

      chrome.tabs.create(
        { url: ANTHROPIC_BILLING_URL, active: false },
        (tab) => {
          console.log(`Opened tab (ID: ${tab.id}) to scrape billing data.`);

          // Listener for messages from content script
          chrome.runtime.onMessage.addListener(function messageListener(
            request,
            sender,
            sendResponse
          ) {
            if (request.action === "billingDataScraped") {
              console.log(
                "Billing data received from content script:",
                request.data
              );
              chrome.runtime.onMessage.removeListener(messageListener);
              chrome.tabs.remove(tab.id, () => {
                console.log(`Closed tab (ID: ${tab.id}).`);
              });

              const balance = request.data.creditBalance; // Format (string): "US$123.45"
              const remainingBalance = Number(
                balance.replace(/[^0-9.]/g, "")
              ).toFixed(2); // Format (number): 123.45

              if (isNaN(remainingBalance)) {
                console.warn(
                  `Parsed balance is NaN. Received raw balance: "${balance}"`
                );
                sendToSlack(
                  SLACK_WEBHOOK_URL,
                  `🚨 *Anthropic Billing Tracker Error*\n\n` +
                    `Unable to parse balance value.\n` +
                    `• Raw balance received: \`${balance}\`\n` +
                    `• Time: \`${new Date().toLocaleString()}\`\n` +
                    `• Please check your balance and update the extension settings.`
                );
                return;
              }

              console.log(`Remaining Balance: ${balance}`);

              // Update storage with the latest balance and scrape info
              const currentTime = Date.now();
              const logEntry = {
                sno: currentTime, // Using timestamp as serial number
                balance: balance,
                timestamp: new Date(currentTime).toLocaleString(),
              };

              // Retrieve existing logs
              chrome.storage.local.get(["scrapeLogs"], (res) => {
                let logs = res.scrapeLogs || [];
                logs.push(logEntry);

                // Maintain only the latest 100 logs
                if (logs.length > 100) {
                  logs = logs.slice(-100);
                }

                chrome.storage.local.set({ scrapeLogs: logs }, () => {
                  console.log("Scrape log updated.");
                  // Notify popup or options page to refresh
                  notifyExtension();
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
                  // Send notification to popup or options page to refresh
                  notifyExtension();
                }
              );

              // Determine next scrape interval based on balance
              const nextInterval = determineNextInterval(
                remainingBalance,
                balanceThresholds
              );

              // Calculate expected next scrape time
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
                  // Notify popup or options page to refresh
                  notifyExtension();
                }
              );

              // Send alert if applicable
              checkAndNotify(
                remainingBalance,
                SLACK_WEBHOOK_URL,
                balanceThresholds
              );

              // Set the next alarm
              setAlarm(nextInterval);
            }
          });
        }
      );
    }
  );
}

// Function to scrape balance and log to console when Slack webhook is not set
function scrapeBalanceAndLog() {
  // Retrieve Balance Thresholds from storage
  chrome.storage.local.get(["balanceThresholds"], (result) => {
    const balanceThresholds = result.balanceThresholds;

    if (!balanceThresholds || balanceThresholds.length === 0) {
      console.warn("No balance thresholds set. Scraping is skipped.");
      return;
    }

    chrome.tabs.create({ url: ANTHROPIC_BILLING_URL, active: false }, (tab) => {
      console.log(`Opened tab (ID: ${tab.id}) to scrape billing data.`);

      // Listener for messages from content script
      chrome.runtime.onMessage.addListener(function messageListener(
        request,
        sender,
        sendResponse
      ) {
        if (request.action === "billingDataScraped") {
          console.log(
            "Billing data received from content script:",
            request.data
          );
          chrome.runtime.onMessage.removeListener(messageListener);
          chrome.tabs.remove(tab.id, () => {
            console.log(`Closed tab (ID: ${tab.id}).`);
          });

          const balance = request.data.creditBalance;
          const balance_integer = Number(balance.replace(/[$,]/g, "")).toFixed(
            2
          );

          if (isNaN(balance_integer)) {
            console.warn(
              `Parsed balance is NaN. Received raw balance: "${balance}"`
            );
            return;
          }

          console.log(`Remaining Balance: ${balance}`);

          // Update storage with the latest balance and scrape info
          const currentTime = Date.now();
          const logEntry = {
            sno: currentTime, // Using timestamp as serial number
            balance: `$${balance_integer}`,
            timestamp: new Date(currentTime).toLocaleString(),
          };

          // Retrieve existing logs
          chrome.storage.local.get(["scrapeLogs"], (res) => {
            let logs = res.scrapeLogs || [];
            logs.push(logEntry);

            // Maintain only the latest 100 logs
            if (logs.length > 100) logs = logs.slice(-100);

            chrome.storage.local.set({ scrapeLogs: logs }, () => {
              console.log("Scrape log updated.");
              // Notify popup or options page to refresh
              notifyExtension();
            });
          });

          // Update last scrape info
          chrome.storage.local.set(
            {
              lastBalance: balance_integer,
              lastScrapeTime: currentTime,
            },
            () => {
              console.log("Last scrape info updated.");
              // Notify popup or options page to refresh
              notifyExtension();
            }
          );

          // Determine next scrape interval based on balance
          const nextInterval = determineNextInterval(
            balance_integer,
            balanceThresholds
          );

          // Calculate expected next scrape time
          const expectedNextScrapeTime = new Date(
            currentTime + nextInterval * 60000
          ).toLocaleString();

          chrome.storage.local.set(
            {
              nextScrapeInterval: nextInterval,
              nextScrapeTime: expectedNextScrapeTime,
            },
            () => {
              console.log("Next scrape info updated.");
              // Notify popup or options page to refresh
              notifyExtension();
            }
          );

          // Set the next alarm
          setAlarm(nextInterval);
        }
      });
    });
  });
}

// Function to determine next scrape interval based on balance and thresholds
function determineNextInterval(balance, balanceThresholds) {
  // Sort thresholds ascending by limit
  const sortedThresholds = [...balanceThresholds].sort(
    (a, b) => a.limit - b.limit
  );

  for (let threshold of sortedThresholds) {
    if (balance <= threshold.limit) return threshold.interval;
  }

  return 60; // Default to 60 minutes if no threshold matched
}

// Function to check balance against thresholds and notify
function checkAndNotify(balance, webhookUrl, balanceThresholds) {
  // Sort thresholds ascending by limit
  const sortedThresholds = [...balanceThresholds].sort(
    (a, b) => a.limit - b.limit
  );

  for (let threshold of sortedThresholds) {
    if (balance <= threshold.limit) {
      // Send alert
      const msg =
        `🚨 *Anthropic Billing Alert*\n\n` +
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

// Function to notify popup and options page to refresh data
function notifyExtension() {
  chrome.runtime.sendMessage({ action: "updateData" });
}

// Handle manual scrape requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualScrape") {
    console.log("Manual scrape triggered.");
    scrapeAndSendData();
    sendResponse({ status: "success" });
  }
});

// Initial msg after extension installation
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
