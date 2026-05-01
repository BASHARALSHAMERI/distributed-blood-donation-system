const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

const services = {
  donor: process.env.DONOR_SERVICE_URL || "http://donor-service:4001",
  request: process.env.REQUEST_SERVICE_URL || "http://request-service:4002",
  inventory: process.env.INVENTORY_SERVICE_URL || "http://inventory-service:4003",
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:4004"
};

app.use(cors());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({
    service: "api-gateway",
    message: "Distributed Blood Donation API Gateway is running",
    routes: {
      donors: "/api/donors",
      requests: "/api/requests",
      inventory: "/api/inventory",
      notifications: "/api/notifications",
      systemHealth: "/api/system/health"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "UP",
    port: Number(PORT)
  });
});

app.get("/api/system/health", async (req, res) => {
  const healthChecks = [
    { name: "donor-service", url: `${services.donor}/health` },
    { name: "request-service", url: `${services.request}/health` },
    { name: "inventory-service", url: `${services.inventory}/health` },
    { name: "notification-service", url: `${services.notification}/health` }
  ];

  const results = await Promise.all(
    healthChecks.map(async (service) => {
      try {
        const response = await fetch(service.url, {
          signal: AbortSignal.timeout(3000) // 3 seconds timeout
        });

        const data = await response.json();

        return {
          service: service.name,
          status: data.status || "UNKNOWN",
          reachable: true
        };
      } catch (error) {
        return {
          service: service.name,
          status: "DOWN",
          reachable: false,
          error: error.message
        };
      }
    })
  );

  const allUp = results.every((item) => item.reachable);

  res.status(allUp ? 200 : 503).json({
    service: "api-gateway",
    status: allUp ? "UP" : "DEGRADED",
    services: results
  });
});

// دالة موحدة للتعامل مع أخطاء البروكسي (إذا كانت الخدمة المتوجهة إليها متوقفة)
const proxyOnError = {
  onError: (err, req, res) => {
    console.error(`[Proxy Error] ${req.url}: ${err.message}`);
    res.status(503).json({
      error: "Service Unavailable",
      message: `The target service for ${req.originalUrl} is currently down or unreachable.`,
      statusCode: 503
    });
  }
};

// إعداد البروكسي مع تعديل مسار إعادة الكتابة ليبقي اسم الخدمة
app.use(
  "/api/donors",
  createProxyMiddleware({
    target: services.donor,
    changeOrigin: true,
    pathRewrite: { "^/api": "" }, // /api/donors/1 يصبح /donors/1
    ...proxyOnError
  })
);

app.use(
  "/api/requests",
  createProxyMiddleware({
    target: services.request,
    changeOrigin: true,
    pathRewrite: { "^/api": "" }, // /api/requests يصبح /requests
    ...proxyOnError
  })
);

app.use(
  "/api/inventory",
  createProxyMiddleware({
    target: services.inventory,
    changeOrigin: true,
    pathRewrite: { "^/api": "" }, // /api/inventory يصبح /inventory
    ...proxyOnError
  })
);

app.use(
  "/api/notifications",
  createProxyMiddleware({
    target: services.notification,
    changeOrigin: true,
    pathRewrite: { "^/api": "" }, // /api/notifications يصبح /notifications
    ...proxyOnError
  })
);

// معالجة المسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});