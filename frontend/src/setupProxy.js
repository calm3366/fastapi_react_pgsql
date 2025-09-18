// frontend/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ["/search_bonds", "/bonds"],
    createProxyMiddleware({
      target: "http://backend:8000",
      changeOrigin: true,
    })
  );
};
