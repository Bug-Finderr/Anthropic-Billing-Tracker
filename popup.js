document.addEventListener("DOMContentLoaded", () => {
  const slackWebhookTextarea = document.getElementById("slackWebhook");
  const saveWebhookButton = document.getElementById("saveWebhook");
  const webhookStatus = document.getElementById("webhookStatus");
  const remainingBalance = document.getElementById("remainingBalance");
  const lastScrape = document.getElementById("lastScrape");
  const nextScrapeInterval = document.getElementById("nextScrapeInterval");
  const nextScrapeTime = document.getElementById("nextScrapeTime");
  const manualScrapeButton = document.getElementById("manualScrape");
  const openOptionsLink = document.getElementById("openOptions");
  const thresholdsTableBody = document.querySelector("#thresholdsTable tbody");
  const addThresholdButton = document.getElementById("addThreshold");
  const thresholdForm = document.getElementById("thresholdForm");
  const formTitle = document.getElementById("formTitle");
  const thresholdLimitInput = document.getElementById("thresholdLimit");
  const thresholdIntervalInput = document.getElementById("thresholdInterval");
  const saveThresholdButton = document.getElementById("saveThreshold");
  const cancelThresholdButton = document.getElementById("cancelThreshold");

  let editThresholdIndex = null; // To track if editing an existing threshold

  // Load Slack Webhook URL from storage
  chrome.storage.local.get(["slackWebhookUrl"], (result) => {
    if (result.slackWebhookUrl) {
      slackWebhookTextarea.value = result.slackWebhookUrl;
    }
  });

  // Save Slack Webhook URL to storage
  saveWebhookButton.addEventListener("click", () => {
    const webhookUrl = slackWebhookTextarea.value.trim();
    if (!webhookUrl) {
      webhookStatus.textContent = "Webhook URL cannot be empty.";
      webhookStatus.style.color = "red";
      return;
    }

    // Optional: Validate webhook URL format
    if (!isValidURL(webhookUrl)) {
      webhookStatus.textContent = "Please enter a valid URL.";
      webhookStatus.style.color = "red";
      return;
    }

    chrome.storage.local.set({ slackWebhookUrl: webhookUrl }, () => {
      webhookStatus.textContent = "Webhook URL saved successfully!";
      webhookStatus.style.color = "green";
      setTimeout(() => {
        webhookStatus.textContent = "";
      }, 3000);
    });
  });

  // Function to validate URL
  function isValidURL(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Function to load and display thresholds
  function loadThresholds() {
    chrome.storage.local.get(["balanceThresholds"], (result) => {
      const thresholds = result.balanceThresholds || [];
      thresholdsTableBody.innerHTML = ""; // Clear existing rows

      thresholds.forEach((threshold, index) => {
        const row = document.createElement("tr");

        const limitCell = document.createElement("td");
        limitCell.textContent = threshold.limit.toFixed(2);
        row.appendChild(limitCell);

        const intervalCell = document.createElement("td");
        intervalCell.textContent = threshold.interval;
        row.appendChild(intervalCell);

        const actionsCell = document.createElement("td");

        const editButton = document.createElement("i");
        editButton.className = "fas fa-pencil-alt edit-btn";
        editButton.dataset.index = index;
        actionsCell.appendChild(editButton);

        const deleteButton = document.createElement("i");
        deleteButton.className = "fas fa-trash delete-btn";
        deleteButton.dataset.index = index;
        actionsCell.appendChild(deleteButton);

        row.appendChild(actionsCell);

        thresholdsTableBody.appendChild(row);
      });
    });
  }

  // Initial load of thresholds
  loadThresholds();

  // Listen for update notifications from background.js
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateData") {
      displayBillingInfo();
      loadThresholds();
    }
  });

  // Function to fetch and display billing info
  function displayBillingInfo() {
    chrome.storage.local.get(
      ["lastBalance", "lastScrapeTime", "nextScrapeInterval", "nextScrapeTime"],
      (result) => {
        remainingBalance.textContent = result.lastBalance
          ? `$${result.lastBalance}`
          : "N/A";
        lastScrape.textContent = result.lastScrapeTime
          ? new Date(result.lastScrapeTime).toLocaleString()
          : "N/A";
        nextScrapeInterval.textContent = result.nextScrapeInterval
          ? `${result.nextScrapeInterval} minutes`
          : "N/A";
        nextScrapeTime.textContent = result.nextScrapeTime
          ? new Date(result.nextScrapeTime).toLocaleString()
          : "N/A";
      }
    );
  }

  // Initial display of billing info
  displayBillingInfo();

  // Refresh billing info every minute
  setInterval(displayBillingInfo, 60000);

  // Manual scrape and send
  manualScrapeButton.addEventListener("click", () => {
    chrome.storage.local.get(["balanceThresholds"], (result) => {
      const thresholds = result.balanceThresholds || [];
      if (thresholds.length === 0) {
        webhookStatus.textContent =
          "Please add at least one balance threshold.";
        webhookStatus.style.color = "red";
        return;
      }

      chrome.runtime.sendMessage({ action: "manualScrape" }, (response) => {
        if (response && response.status === "success") {
          webhookStatus.textContent = "Manual scrape triggered!";
          webhookStatus.style.color = "green";
          setTimeout(() => {
            webhookStatus.textContent = "";
          }, 3000);
        } else {
          webhookStatus.textContent = "Manual scrape failed.";
          webhookStatus.style.color = "red";
          setTimeout(() => {
            webhookStatus.textContent = "";
          }, 3000);
        }
      });
    });
  });

  // Open Options Page
  openOptionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });

  // Add Threshold button click
  addThresholdButton.addEventListener("click", () => {
    editThresholdIndex = null; // Reset to add new threshold
    formTitle.textContent = "Add Threshold";
    thresholdLimitInput.value = "";
    thresholdIntervalInput.value = "";
    thresholdForm.classList.remove("hidden");
  });

  // Cancel Threshold button click
  cancelThresholdButton.addEventListener("click", () => {
    thresholdForm.classList.add("hidden");
  });

  // Save Threshold button click
  saveThresholdButton.addEventListener("click", () => {
    const limit = parseFloat(thresholdLimitInput.value);
    const interval = parseInt(thresholdIntervalInput.value);

    if (isNaN(limit) || isNaN(interval)) {
      alert("Please enter valid numeric values for limit and interval.");
      return;
    }

    if (limit < 0) {
      alert("Limit must be a positive number.");
      return;
    }

    if (interval < 1) {
      alert("Interval must be at least 1 minute.");
      return;
    }

    // Retrieve existing thresholds
    chrome.storage.local.get(["balanceThresholds"], (result) => {
      let thresholds = result.balanceThresholds || [];

      if (editThresholdIndex !== null) {
        // Edit existing threshold
        thresholds[editThresholdIndex] = { limit, interval };
      } else {
        // Add new threshold
        thresholds.push({ limit, interval });
      }

      // Sort thresholds ascending by limit
      thresholds.sort((a, b) => a.limit - b.limit);

      // Save updated thresholds
      chrome.storage.local.set({ balanceThresholds: thresholds }, () => {
        console.log("Balance thresholds updated.");
        thresholdForm.classList.add("hidden");
        loadThresholds();
        // Optionally, notify background.js to re-calculate intervals
        chrome.runtime.sendMessage({ action: "updateData" });
      });
    });
  });

  // Edit and Delete button handlers
  thresholdsTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("edit-btn")) {
      const index = parseInt(e.target.dataset.index);
      editThresholdIndex = index;

      chrome.storage.local.get(["balanceThresholds"], (result) => {
        const thresholds = result.balanceThresholds || [];
        const threshold = thresholds[index];
        if (threshold) {
          formTitle.textContent = "Edit Threshold";
          thresholdLimitInput.value = threshold.limit;
          thresholdIntervalInput.value = threshold.interval;
          thresholdForm.classList.remove("hidden");
        }
      });
    }

    if (e.target.classList.contains("delete-btn")) {
      const index = parseInt(e.target.dataset.index);
      if (confirm("Are you sure you want to delete this threshold?")) {
        chrome.storage.local.get(["balanceThresholds"], (result) => {
          let thresholds = result.balanceThresholds || [];
          thresholds.splice(index, 1); // Remove the threshold

          chrome.storage.local.set({ balanceThresholds: thresholds }, () => {
            console.log("Balance threshold deleted.");
            loadThresholds();
            // Optionally, notify background.js to re-calculate intervals
            chrome.runtime.sendMessage({ action: "updateData" });
          });
        });
      }
    }
  });
});
