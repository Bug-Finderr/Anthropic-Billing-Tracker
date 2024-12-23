document.addEventListener("DOMContentLoaded", () => {
  const logsTableBody = document.querySelector("#logsTable tbody");

  // Function to load logs from storage and populate the table
  function loadLogs() {
    chrome.storage.local.get(["scrapeLogs"], (result) => {
      const logs = result.scrapeLogs || [];
      logsTableBody.innerHTML = ""; // Clear existing logs

      // Sort logs by sno descending (latest first)
      logs.sort((a, b) => b.sno - a.sno);

      logs.forEach((log, index) => {
        const row = document.createElement("tr");

        const snoCell = document.createElement("td");
        snoCell.textContent = index + 1;
        row.appendChild(snoCell);

        const balanceCell = document.createElement("td");
        balanceCell.textContent = log.balance;
        row.appendChild(balanceCell);

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp;
        row.appendChild(timestampCell);

        logsTableBody.appendChild(row);
      });
    });
  }

  // Initial load of logs
  loadLogs();

  // Listen for update notifications from background.js
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateData") {
      loadLogs();
    }
  });
});
