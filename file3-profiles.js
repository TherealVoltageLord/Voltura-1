const express = require("express");
const { User, Post } = require("./file1-auth-posts");
const authenticateToken = require("./file1-auth-posts").authenticateToken;
const profilePicUpload = require("./file1-auth-posts").profilePicUpload;
const coverUpload = require("./file1-auth-posts").coverUpload;

const router = express.Router();

router.get("/users/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -notifications')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic')
      .populate('blockedUsers', 'username profilePic');

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.privacy.profile === 'private' && (!req.user || req.user._id.toString() !== user._id.toString())) {
      const isFollowing = user.followers.some(follower => follower._id.toString() === req.user?._id?.toString());
      if (!isFollowing) {
        return res.json({
          success: true,
          user: {
            id: user._id,
            username: user.username,
            profilePic: user.profilePic,
            privacy: user.privacy,
            isPrivate: true
          },
          limited: true
        });
      }
    }

    const postCount = await Post.countDocuments({ username: req.params.username, status: 'active' });
    const isBlocked = req.user ? user.blockedUsers.some(blocked => blocked._id.toString() === req.user._id.toString()) : false;

    if (isBlocked && req.user) {
      return res.json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          profilePic: user.profilePic,
          isBlocked: true
        },
        limited: true
      });
    }

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        postCount,
        isFollowing: req.user ? user.followers.some(follower => follower._id.toString() === req.user._id.toString()) : false
      }
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/profile", authenticateToken, profilePicUpload.single("profilePic"), async (req, res) => {
  try {
    const { bio, privacy } = req.body;
    const updateData = {};

    if (bio !== undefined) updateData.bio = bio;
    if (privacy) {
      try {
        const privacyData = typeof privacy === 'string' ? JSON.parse(privacy) : privacy;
        updateData.privacy = privacyData;
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid privacy settings" });
      }
    }
    if (req.file) {
      updateData.profilePic = `/uploads/profile_pics/${req.file.filename}`;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password -notifications');

    res.json({ success: true, message: "Profile updated successfully!", user: updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/profile/cover", authenticateToken, coverUpload.single("coverPhoto"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No cover photo uploaded" });

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { coverPhoto: `/uploads/covers/${req.file.filename}` },
      { new: true }
    ).select('-password -notifications');

    res.json({ success: true, message: "Cover photo updated successfully!", user: updatedUser });
  } catch (error) {
    console.error("Update cover error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/users/:username/follow", authenticateToken, async (req, res) => {
  try {
    const targetUsername = req.params.username;
    const followerId = req.user._id;

    if (req.user.username === targetUsername) {
      return res.status(400).json({ success: false, message: "Cannot follow yourself" });
    }

    const userToFollow = await User.findOne({ username: targetUsername });
    if (!userToFollow) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (userToFollow.privacy.profile === 'private') {
      const isBlocked = userToFollow.blockedUsers.includes(followerId);
      if (isBlocked) {
        return res.status(403).json({ success: false, message: "Cannot follow this user" });
      }
    }

    const isAlreadyFollowing = userToFollow.followers.includes(followerId);
    if (isAlreadyFollowing) {
      userToFollow.followers.pull(followerId);
      await User.findByIdAndUpdate(followerId, { $pull: { following: userToFollow._id } });
      await userToFollow.save();
      return res.json({ success: true, message: "Unfollowed user!", action: 'unfollow' });
    }

    userToFollow.followers.push(followerId);
    await User.findByIdAndUpdate(followerId, { $push: { following: userToFollow._id } });
    await userToFollow.save();

    await User.findByIdAndUpdate(userToFollow._id, {
      $push: {
        notifications: {
          type: "follow",
          fromUserId: followerId,
          message: `${req.user.username} started following you`,
          timestamp: new Date()
        }
      }
    });

    res.json({ success: true, message: "Followed user successfully!", action: 'follow' });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/users/:username/block", authenticateToken, async (req, res) => {
  try {
    const targetUsername = req.params.username;
    const blockerId = req.user._id;

    if (req.user.username === targetUsername) {
      return res.status(400).json({ success: false, message: "Cannot block yourself" });
    }

    const userToBlock = await User.findOne({ username: targetUsername });
    if (!userToBlock) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isAlreadyBlocked = req.user.blockedUsers.includes(userToBlock._id);
    if (isAlreadyBlocked) {
      await User.findByIdAndUpdate(blockerId, { $pull: { blockedUsers: userToBlock._id } });
      await User.findByIdAndUpdate(userToBlock._id, { $pull: { followers: blockerId } });
      await User.findByIdAndUpdate(blockerId, { $pull: { following: userToBlock._id } });
      return res.json({ success: true, message: "User unblocked!", action: 'unblock' });
    }

    await User.findByIdAndUpdate(blockerId, { $push: { blockedUsers: userToBlock._id } });
    await User.findByIdAndUpdate(userToBlock._id, { $pull: { followers: blockerId } });
    await User.findByIdAndUpdate(blockerId, { $pull: { following: userToBlock._id } });

    res.json({ success: true, message: "User blocked successfully!", action: 'block' });
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/profile/stats/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const postCount = await Post.countDocuments({ username: req.params.username, status: 'active' });
    const totalLikes = await Post.aggregate([
      { $match: { username: req.params.username } },
      { $group: { _id: null, total: { $sum: '$likes' } } }
    ]);
    const totalShares = await Post.aggregate([
      { $match: { username: req.params.username } },
      { $group: { _id: null, total: { $sum: '$shares' } } }
    ]);

    res.json({
      success: true,
      stats: {
        postCount,
        followerCount: user.followers.length,
        followingCount: user.following.length,
        totalLikes: totalLikes[0]?.total || 0,
        totalShares: totalShares[0]?.total || 0
      }
    });
  } catch (error) {
    console.error("Profile stats error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
