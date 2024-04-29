const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const os = require("os");
const http = require("http");
const WebSocket = require("ws");
const { app, BrowserWindow } = require("electron");

const appExpress = express();
const PORT = process.env.PORT || 3000;

const uploadDir = `C:/users/${process.env.USERNAME}/Documents/WIS/`;

// Function to ensure upload directory exists
function ensureUploadDirExists() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

ensureUploadDirExists(); // Call the function to create the directory if it doesn't exist

const ipAddress = getIpAddress(); // Function to get IP address

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    let filename = baseName + ext;
    let i = 1;
    while (fs.existsSync(path.join(uploadDir, filename))) {
      filename = baseName + "_" + i + ext;
      i++;
    }
    cb(null, filename);
  },
});

const upload = multer({ storage: storage });

appExpress.use(express.static(path.join(__dirname, "public")));
appExpress.use("/uploads", express.static(uploadDir));

// Add a global variable to keep track of file uploads
let fileUploaded = false;

// Inside the POST /upload route
appExpress.post("/upload", upload.array("file"), (req, res) => {
  fileUploaded = true; // Set fileUploaded to true after successful upload
  broadcastFileUpload(); // Broadcast file upload to all connected clients
  res.json({ message: "File uploaded successfully" });
});

// Create HTTP server instead of HTTPS
const server = http.createServer(appExpress);

const wss = new WebSocket.Server({ server }); // WebSocket server

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Handle WebSocket close event
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// Broadcast file upload event to all connected clients
function broadcastFileUpload() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: "fileUploaded" }));
    }
  });
}

// Add a new route to check if a file has been uploaded
appExpress.get("/file-uploaded", (req, res) => {
  res.json({ fileUploaded: fileUploaded });
});

appExpress.get("/files", (req, res) => {
  fileUploaded = false;
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to read directory" });
      return;
    }
    const fileDetails = files.map((file) => {
      const filePath = path.join(uploadDir, file);
      const isImage = isImageFile(filePath);
      const isVideo = isVideoFile(filePath); // Add video check
      return {
        name: file,
        isImage: isImage,
        isVideo: isVideo,
        url:
          isImage || isVideo
            ? `http://${ipAddress}:${PORT}/uploads/${encodeURIComponent(file)}`
            : null,
        fileType: getFileTypeIcon(file), // Get the file type
      };
    });
    // Send IP address and hostname along with file details
    res.json({ fileDetails, ipAddress, PORT });
  });
});

appExpress.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to download file" });
    }
  });
});

appExpress.delete("/delete/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete file" });
      return;
    }
    res.json({ message: "File deleted successfully" });
  });
});

function isImageFile(filePath) {
  const allowedExtensions = [".png", ".jpg", ".jpeg", ".gif"];
  const ext = path.extname(filePath).toLowerCase();
  return allowedExtensions.includes(ext);
}

function isVideoFile(filePath) {
  const allowedExtensions = [".mp4", ".mov", ".avi", ".mkv"];
  const ext = path.extname(filePath).toLowerCase();
  return allowedExtensions.includes(ext);
}

function getFileTypeIcon(filename) {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case ".txt":
    case ".readme":
      return "/icons/text.png";

    case ".msi":
      return "/icons/msi.png";

    case ".exe":
      return "/icons/exe.png";

    case ".json":
      return "/icons/json.png";

    case ".js":
      return "/icons/js.png";

    case ".cpp":
      return "/icons/cpp.png";

    case ".cs":
      return "/icons/cs.png";

    case ".c":
      return "/icons/c.png";

    case ".css":
      return "/icons/css.png";

    case ".html":
      return "/icons/html.png";

    case ".mp3":
      return "/icons/audio.png";

    case ".zip":
      return "/icons/zip.png";

    case ".py":
      return "/icons/py.png";

    case ".heic":
      return "/icons/image.png";

    case ".mp4":
    case ".mov":
    case ".avi":
    case ".mkv":
      return "/icons/video.png";
    default:
      return "/icons/default.png"; // Placeholder for other types
  }
}

function getIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName]) {
      if (!iface.internal && iface.family === "IPv4") {
        return iface.address;
      }
    }
  }
  return "localhost"; // Default to localhost if IP address is not found
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
    autoHideMenuBar: true, // Hide the menu bar
  });

  // Load the localhost URL
  mainWindow.loadURL(`http://${ipAddress}:${PORT}`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Start the HTTP server
server.listen(PORT, ipAddress, () => {
  console.log(`Server is running on http://${ipAddress}:${PORT}`);
});
