const dgram = require("dgram");

const MULTICAST_GROUP = process.env.MULTICAST_GROUP || "239.10.10.10";
const MULTICAST_PORT = Number(process.env.MULTICAST_PORT || 5005);

const socket = dgram.createSocket({
  type: "udp4",
  reuseAddr: true
});

socket.on("listening", () => {
  const address = socket.address();

  try {
    socket.addMembership(MULTICAST_GROUP);
    socket.setMulticastTTL(1);
  } catch (error) {
    console.error("Failed to join multicast group:", error.message);
  }

  console.log(
    `Multicast Node listening on ${address.address}:${address.port}, group=${MULTICAST_GROUP}`
  );
});

socket.on("message", (message, remote) => {
  const raw = message.toString();

  try {
    const data = JSON.parse(raw);

    console.log("========================================");
    console.log("CRITICAL MULTICAST ALERT RECEIVED");
    console.log("From:", `${remote.address}:${remote.port}`);
    console.log("Alert Type:", data.type);
    console.log("Blood Type:", data.bloodType);
    console.log("City:", data.city);
    console.log("Hospital:", data.hospitalName);
    console.log("Urgency:", data.urgency);
    console.log("Request ID:", data.requestId);
    console.log("Time:", data.sentAt);
    console.log("========================================");
  } catch (error) {
    console.log("Received raw multicast message:", raw);
  }
});

socket.on("error", (error) => {
  console.error("Multicast socket error:", error.message);
});

socket.bind(MULTICAST_PORT, "0.0.0.0");
