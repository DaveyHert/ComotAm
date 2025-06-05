// Content script for Element Remover extension
(function () {
  "use strict";

  const currentDomain = window.location.hostname;
  let extensionContextValid = true;

  // Check if extension context is still valid
  function checkExtensionContext() {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        return true;
      }
    } catch (error) {
      extensionContextValid = false;
      return false;
    }
    extensionContextValid = false;
    return false;
  }

  // Function to remove elements by selector
  function removeElements(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      let count = 0;

      elements.forEach((element) => {
        element.remove();
        count++;
      });

      return { success: true, count };
    } catch (error) {
      console.error("Element Remover Error:", error);
      return { success: false, error: error.message };
    }
  }

  // Function to apply all rules for current domain
  function applyRules() {
    if (!checkExtensionContext()) {
      console.log(
        "Element Remover: Extension context invalidated, stopping operations"
      );
      return;
    }

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([currentDomain], function (result) {
        if (!checkExtensionContext()) {
          return;
        }

        if (chrome.runtime.lastError) {
          console.error("Storage error:", chrome.runtime.lastError);
          return;
        }

        const rules = result[currentDomain] || [];

        rules.forEach((rule) => {
          // Only auto-remove if autoRemove is not explicitly set to false
          if (rule.autoRemove !== false) {
            const removeResult = removeElements(rule.selector);
            if (removeResult.success && removeResult.count > 0) {
              console.log(
                `Element Remover: Auto-removed ${removeResult.count} element(s) with selector "${rule.selector}"`
              );
            }
          }
        });
      });
    }
  }

  // Listen for messages from popup
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener(function (
      request,
      sender,
      sendResponse
    ) {
      if (!checkExtensionContext()) {
        sendResponse({
          success: false,
          error: "Extension context invalidated",
        });
        return;
      }

      if (request.action === "removeElement") {
        const result = removeElements(request.selector);
        sendResponse(result);
        return true; // Keep message channel open for async response
      } else if (request.action === "applyRules") {
        // New action to re-apply rules after adding a new one
        applyRules();
        sendResponse({ success: true });
        return true;
      }
    });
  }

  // Wait for DOM to be ready
  function initializeExtension() {
    if (!checkExtensionContext()) {
      return;
    }

    // Apply rules when page loads
    applyRules();

    // Also apply rules when new content is dynamically loaded
    // Use MutationObserver to detect DOM changes
    if (document.body) {
      const observer = new MutationObserver(function (mutations) {
        if (!checkExtensionContext()) {
          observer.disconnect();
          return;
        }

        let shouldApplyRules = false;

        mutations.forEach((mutation) => {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            // Check if any added nodes are elements (not text nodes)
            for (let node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                shouldApplyRules = true;
                break;
              }
            }
          }
        });

        if (shouldApplyRules) {
          // Debounce to avoid excessive rule applications
          clearTimeout(observer.debounceTimer);
          observer.debounceTimer = setTimeout(() => {
            if (checkExtensionContext()) {
              applyRules();
            }
          }, 500);
        }
      });

      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Clean up observer when page unloads or extension context invalidates
      window.addEventListener("beforeunload", function () {
        observer.disconnect();
      });

      // Periodically check extension context and disconnect if invalid
      const contextChecker = setInterval(() => {
        if (!checkExtensionContext()) {
          observer.disconnect();
          clearInterval(contextChecker);
        }
      }, 5000);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeExtension);
  } else {
    initializeExtension();
  }
})();
