document.addEventListener("DOMContentLoaded", () => {
  const totalEl = document.getElementById("total");
  const identifiedEl = document.getElementById("identified");
  const clearBtn = document.getElementById("clear");

  function refresh() {
    chrome.runtime.sendMessage({ type: "cacheStats" }, (res) => {
      if (!res?.ok) return;
      totalEl.textContent = String(res.total);
      identifiedEl.textContent = String(res.identified);
    });
  }

  clearBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "clearCache" }, () => {
      refresh();
      clearBtn.textContent = "Cleared — reload YouTube tabs";
      setTimeout(() => (clearBtn.textContent = "Clear cache & re-check"), 3000);
    });
  });

  refresh();
});
