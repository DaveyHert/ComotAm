let currentUrl = "";
let currentDomain = "";

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // dark and light mode theme setup
  const toggleBtn = document.querySelector(".theme-toggle");
  const body = document.body;

  // Load saved theme
  chrome.storage.local.get(["theme"], ({ theme }) => {
    if (theme === "dark") body.classList.add("dark");
  });
  //   toggle dark/light mode
  toggleBtn.addEventListener("click", () => {
    body.classList.toggle("dark");
    const currentTheme = body.classList.contains("dark") ? "dark" : "light";
    chrome.storage.local.set({ theme: currentTheme });
  });

  // Update selector label based on type
  document
    .getElementById("selectorType")
    .addEventListener("change", function () {
      const type = this.value;
      const label = document.getElementById("selectorLabel");
      const input = document.getElementById("selectorValue");

      switch (type) {
        case "id":
          label.textContent = "Element ID:";
          input.placeholder = "Enter element ID (without #)";
          break;
        case "class":
          label.textContent = "Class Name:";
          input.placeholder = "Enter class name (without .)";
          break;
        case "tag":
          label.textContent = "Tag Name:";
          input.placeholder = "Enter tag name (e.g., div, span)";
          break;
        case "custom":
          label.textContent = "CSS Selector:";
          input.placeholder =
            "Enter custom CSS selector (e.g., iframe[id='video'])";
          break;
      }
    });

  // Get current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      currentUrl = tabs[0].url;
      try {
        currentDomain = new URL(currentUrl).hostname;
      } catch (e) {
        currentDomain = "localhost";
      }
      document.getElementById("currentUrl").textContent = currentDomain;
      loadRules();
    }
  });

  // Add new rule button
  document.getElementById("addRule").addEventListener("click", function () {
    try {
      const selector = buildSelector();
      const type = document.getElementById("selectorType").value;
      const autoRemove = document.getElementById("autoRemove").checked;

      chrome.storage.local.get([currentDomain], function (result) {
        const rules = result[currentDomain] || [];

        // Check if rule already exists
        if (rules.some((rule) => rule.selector === selector)) {
          showStatus("Rule already exists for this selector", "error");
          return;
        }

        rules.unshift({ selector, type, autoRemove });

        chrome.storage.local.set({ [currentDomain]: rules }, function () {
          if (chrome.runtime.lastError) {
            showStatus(
              "Error saving rule: " + chrome.runtime.lastError.message,
              "error"
            );
          } else {
            showStatus("Rule added successfully");
            loadRules();
            document.getElementById("selectorValue").value = "";

            // Apply the new rule immediately if autoRemove is enabled
            if (autoRemove) {
              chrome.tabs.query(
                { active: true, currentWindow: true },
                function (tabs) {
                  if (tabs[0]) {
                    chrome.tabs.sendMessage(
                      tabs[0].id,
                      {
                        action: "applyRules",
                      },
                      function (response) {
                        if (chrome.runtime.lastError) {
                          console.error(
                            "Error applying rules:",
                            chrome.runtime.lastError
                          );
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        });
      });
    } catch (error) {
      showStatus(error.message, "error");
    }
  });

  // Remove elements immediately button
  document.getElementById("removeNow").addEventListener("click", function () {
    try {
      const selector = buildSelector();

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0]) {
          showStatus("No active tab found", "error");
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "removeElement",
            selector: selector,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              showStatus("Error: " + chrome.runtime.lastError.message, "error");
              console.error("Runtime error:", chrome.runtime.lastError);
            } else if (response && response.success) {
              showStatus(`Removed ${response.count} element(s)`);
            } else if (response && response.error) {
              showStatus("Error: " + response.error, "error");
            } else {
              showStatus("No elements found with that selector", "error");
            }
          }
        );
      });
    } catch (error) {
      showStatus(error.message, "error");
    }
  });
});

// Load rules for current domain
function loadRules() {
  chrome.storage.local.get([currentDomain], function (result) {
    if (chrome.runtime.lastError) {
      console.error("Error loading rules:", chrome.runtime.lastError);
      return;
    }
    const rules = result[currentDomain] || [];
    displayRules(rules);
  });
}

// Display rules in the list
function displayRules(rules) {
  const rulesList = document.getElementById("rulesList");

  if (rules.length === 0) {
    rulesList.innerHTML =
      '<div class="no-rules">No rules configured for this site</div>';
    return;
  }

  rulesList.innerHTML = rules
    .map(
      (rule, index) => `
    <div class="rule-item">
      <div class="rule-info">
        <div class="rule-selector">${escapeHtml(rule.selector)}</div>
        <div class="rule-type">${escapeHtml(rule.type)}</div>
        <div class="auto-toggle ${rule.autoRemove !== false ? "" : "disabled"}">
          ${rule.autoRemove !== false ? "Auto" : "Manual"}
        </div>
      </div>
      <div class="rule-controls">
        ${
          rule.autoRemove === false
            ? `<button class="remove-manual" data-index="${index}" title="Remove elements now">▶️</button>`
            : ""
        }
        <button class="toggle-auto" data-index="${index}" title="Toggle auto-removal">
          ${rule.autoRemove !== false ? "🔄" : "⏸️"}
        </button>
        <button class="delete-rule" data-index="${index}" title="Delete rule">×</button>
      </div>
    </div>
  `
    )
    .join("");

  // Add delete event listeners
  document.querySelectorAll(".delete-rule").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index);
      deleteRule(index);
      // get data-index value-string from button, convert to number, & pass to deleteRule()
    });
  });

  // Add toggle event listeners
  document.querySelectorAll(".toggle-auto").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index);
      toggleAutoRemove(index);
    });
  });

  // Add manual remove event listeners
  document.querySelectorAll(".remove-manual").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index);
      manualRemove(index);
    });
  });
}

// Manually remove elements for a specific rule
function manualRemove(index) {
  chrome.storage.local.get([currentDomain], function (result) {
    if (chrome.runtime.lastError) {
      showStatus("Error accessing storage", "error");
      return;
    }

    const rules = result[currentDomain] || [];
    if (rules[index]) {
      const selector = rules[index].selector;

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0]) {
          showStatus("No active tab found", "error");
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "removeElement",
            selector: selector,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              showStatus("Error: " + chrome.runtime.lastError.message, "error");
            } else if (response && response.success) {
              showStatus(
                `Removed ${response.count} element(s) with rule: ${selector}`
              );
            } else if (response && response.error) {
              showStatus("Error: " + response.error, "error");
            } else {
              showStatus("No elements found with that selector", "error");
            }
          }
        );
      });
    }
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Show status message
function showStatus(message, type = "success") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = "block";

  setTimeout(() => {
    status.style.display = "none";
  }, 3000);
}

// Build CSS selector from form inputs
function buildSelector() {
  const type = document.getElementById("selectorType").value;
  const value = document.getElementById("selectorValue").value.trim();

  if (!value) {
    throw new Error("Please enter a selector value");
  }

  switch (type) {
    case "id":
      return `#${value}`;
    case "class":
      return `.${value}`;
    case "tag":
      return value;
    case "custom":
      return value;
    default:
      throw new Error("Invalid selector type");
  }
}

// Toggle auto-removal for a rule
function toggleAutoRemove(index) {
  chrome.storage.local.get([currentDomain], function (result) {
    if (chrome.runtime.lastError) {
      showStatus("Error accessing storage", "error");
      return;
    }

    const rules = result[currentDomain] || [];
    if (rules[index]) {
      // Toggle the autoRemove property (default to true for existing rules)
      rules[index].autoRemove = rules[index].autoRemove === false;

      chrome.storage.local.set({ [currentDomain]: rules }, function () {
        if (chrome.runtime.lastError) {
          showStatus("Error updating rule", "error");
        } else {
          showStatus(
            `Auto-removal ${rules[index].autoRemove ? "enabled" : "disabled"}`
          );
          loadRules();
        }
      });
    }
  });
}

// Delete rule

function deleteRule(index) {
  const rulesList = document.getElementById("rulesList");

  const item = rulesList.children[index]; // Get the element to animate

  if (!item) {
    console.warn("No rule element found at index", index);
    return;
  }

  // animate element
  item.animate(
    [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.95)" },
    ],
    {
      duration: 250,
      easing: "ease",
    }
  ).onfinish = () => {
    // Now update storage after animation
    chrome.storage.local.get([currentDomain], function (result) {
      if (chrome.runtime.lastError) {
        showStatus("Error accessing storage", "error");
        return;
      }
      const rules = result[currentDomain] || [];
      rules.splice(index, 1);
      chrome.storage.local.set({ [currentDomain]: rules }, function () {
        if (chrome.runtime.lastError) {
          showStatus("Error deleting rule", "error");
        } else {
          showStatus("Rule deleted");
          loadRules(); // Triggers re-render after deletion
        }
      });
    });
  };
}
