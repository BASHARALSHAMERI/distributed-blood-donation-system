const dgram = require("dgram");

const MULTICAST_GROUP = process.env.MULTICAST_GROUP || "239.10.10.10";
const MULTICAST_PORT = Number(process.env.MULTICAST_PORT || 5005);

const socket = dgram.createSocket("udp4");

const alert = {
  type: "MANUAL_TEST_ALERT",
  bloodType: "O+",
  city: "Sanaa",
  hospitalName: "Manual Test Hospital",
  urgency: "CRITICAL",
  requestId: "manual-test",
  sentAt: new Date().toISOString()
};

const message = Buffer.from(JSON.stringify(alert));

socket.send(message, 0, message.length, MULTICAST_PORT, MULTICAST_GROUP, (error) => {
  if (error) {
    console.error("Failed to send multicast message:", error.message);
  } else {
    console.log("Manual multicast test message sent:", alert);
  }

  socket.close();
});
