// Function to scrape billing data from the page
function scrapeBillingData() {
  const creditBalanceElement = document.querySelector(
    '[data-testid="credit-balance"] .text-text-000'
  );

  if (creditBalanceElement) {
    const creditBalance = creditBalanceElement.textContent.trim();
    console.log(`Scraped Credit Balance: ${creditBalance}`);
    return { creditBalance };
  } else {
    console.warn("Credit balance element not found.");
    return { creditBalance: "N/A" };
  }
}

// Function to wait until the balance is loaded with a timeout
function waitForRealValue(callback, maxWaitTime = 20000) {
  const startTime = Date.now();

  function checkValue() {
    const creditBalanceElement = document.querySelector(
      '[data-testid="credit-balance"] .text-text-000'
    );

    if (
      creditBalanceElement &&
      !creditBalanceElement.textContent.includes("Loading")
    ) {
      console.log("Credit balance loaded.");
      callback();
    } else if (Date.now() - startTime < maxWaitTime) {
      setTimeout(checkValue, 100); // Check every 100ms
    } else {
      console.warn("Timeout reached while waiting for billing value to load");
      callback(); // Proceed even if timeout is reached
    }
  }

  checkValue();
}

// Function to observe DOM changes and trigger scraping
function waitForPageLoad() {
  const observer = new MutationObserver((mutations, obs) => {
    const creditBalanceElement = document.querySelector(
      '[data-testid="credit-balance"] .text-text-000'
    );
    if (creditBalanceElement) {
      console.log("Credit balance element detected.");
      obs.disconnect(); // Stop observing

      waitForRealValue(() => {
        const data = scrapeBillingData();
        chrome.runtime.sendMessage({
          action: "billingDataScraped",
          data: data,
        });
      });
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
  });
}

// Initial call to start observing
waitForPageLoad();
