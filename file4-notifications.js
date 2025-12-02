const express = require("express");
const { User } = require("./file1-auth-posts");
const authenticateToken = require("./file1-auth-posts").authenticateToken;

const router = express.Router();

router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    const populatedNotifications = await User.populate(user, {
      path: 'notifications.fromUserId',
      select: 'username profilePic'
    });

    res.json({
      success: true,
      notifications: populatedNotifications.notifications || []
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/notifications/read", authenticateToken, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    if (notificationIds && Array.isArray(notificationIds)) {
      await User.updateOne(
        { _id: req.user._id, "notifications._id": { $in: notificationIds } },
        { $set: { "notifications.$.read": true } }
      );
    } else {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { "notifications.$[].read": true } }
      );
    }

    res.json({ success: true, message: "Notifications marked as read" });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.delete("/notifications", authenticateToken, async (req, res) => {
  try {
    const { notificationIds } = req.body;

    if (notificationIds && Array.isArray(notificationIds)) {
      await User.updateOne(
        { _id: req.user._id },
        { $pull: { notifications: { _id: { $in: notificationIds } } } }
      );
    } else {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { notifications: [] } }
      );
    }

    res.json({ success: true, message: "Notifications deleted" });
  } catch (error) {
    console.error("Delete notifications error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/notifications/unread-count", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    const unreadCount = user.notifications.filter(notification => !notification.read).length;

    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/notifications/push", authenticateToken, async (req, res) => {
  try {
    const { userId, title, message, type = 'info' } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    targetUser.notifications.push({
      type: 'admin_broadcast',
      message: `${title}: ${message}`,
      timestamp: new Date()
    });

    await targetUser.save();

    res.json({ success: true, message: "Push notification sent successfully" });
  } catch (error) {
    console.error("Push notification error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
