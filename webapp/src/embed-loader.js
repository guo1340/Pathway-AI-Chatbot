(function () {
  // Avoid multiple injections
  if (window.__RAG_WIDGET_LOADED__) return;
  window.__RAG_WIDGET_LOADED__ = true;

  const iframe = document.createElement("iframe");
  iframe.src = "https://main.xxxxx.amplifyapp.com/"; // your Amplify URL
  iframe.id = "rag-widget-iframe";
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "400px",
    height: "560px",
    border: "none",
    zIndex: "2147483647",
  });
  document.body.appendChild(iframe);
})();
