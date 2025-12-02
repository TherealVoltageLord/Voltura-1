const express = require("express");
const { User, Post } = require("./file1-auth-posts");
const authenticateToken = require("./file1-auth-posts").authenticateToken;

const router = express.Router();

router.post("/posts/:id/like", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const alreadyLiked = post.likedBy.includes(userId);
    const alreadyDisliked = post.dislikedBy.includes(userId);

    if (alreadyLiked) {
      post.likedBy.pull(userId);
      post.likes = post.likedBy.length;
      await post.save();
      return res.json({ success: true, message: "Post unliked!", likes: post.likes, dislikes: post.dislikes, action: 'unlike' });
    }

    if (alreadyDisliked) {
      post.dislikedBy.pull(userId);
      post.dislikes = post.dislikedBy.length;
    }

    post.likedBy.push(userId);
    post.likes = post.likedBy.length;
    await post.save();

    if (post.userId.toString() !== userId.toString()) {
      await User.findByIdAndUpdate(post.userId, {
        $push: {
          notifications: {
            type: "like",
            fromUserId: userId,
            postId: post._id,
            message: `${req.user.username} liked your post`,
            timestamp: new Date()
          }
        }
      });
    }

    res.json({ success: true, message: "Post liked!", likes: post.likes, dislikes: post.dislikes, action: 'like' });
  } catch (error) {
    console.error("Like post error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/posts/:id/dislike", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const alreadyDisliked = post.dislikedBy.includes(userId);
    const alreadyLiked = post.likedBy.includes(userId);

    if (alreadyDisliked) {
      post.dislikedBy.pull(userId);
      post.dislikes = post.dislikedBy.length;
      await post.save();
      return res.json({ success: true, message: "Post undisliked!", likes: post.likes, dislikes: post.dislikes, action: 'undislike' });
    }

    if (alreadyLiked) {
      post.likedBy.pull(userId);
      post.likes = post.likedBy.length;
    }

    post.dislikedBy.push(userId);
    post.dislikes = post.dislikedBy.length;
    await post.save();

    res.json({ success: true, message: "Post disliked!", likes: post.likes, dislikes: post.dislikes, action: 'dislike' });
  } catch (error) {
    console.error("Dislike post error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/posts/:id/comment", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Comment text is required" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const newComment = {
      userId: userId,
      username: req.user.username,
      text: text.trim(),
      timestamp: new Date()
    };

    post.comments.push(newComment);
    await post.save();

    if (post.userId.toString() !== userId.toString()) {
      await User.findByIdAndUpdate(post.userId, {
        $push: {
          notifications: {
            type: "comment",
            fromUserId: userId,
            postId: post._id,
            message: `${req.user.username} commented on your post: "${text.substring(0, 50)}..."`,
            timestamp: new Date()
          }
        }
      });
    }

    const updatedPost = await Post.findById(postId).populate('comments.userId', 'username profilePic');
    const addedComment = updatedPost.comments[updatedPost.comments.length - 1];

    res.json({ success: true, message: "Comment added!", comment: addedComment });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/posts/:postId/comments/:commentId/reply", authenticateToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Reply text is required" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    const newReply = {
      userId: userId,
      username: req.user.username,
      text: text.trim(),
      timestamp: new Date()
    };

    comment.replies.push(newReply);
    await post.save();

    if (comment.userId.toString() !== userId.toString()) {
      await User.findByIdAndUpdate(comment.userId, {
        $push: {
          notifications: {
            type: "reply",
            fromUserId: userId,
            postId: post._id,
            commentId: commentId,
            message: `${req.user.username} replied to your comment`,
            timestamp: new Date()
          }
        }
      });
    }

    const updatedPost = await Post.findById(postId);
    const updatedComment = updatedPost.comments.id(commentId);
    const addedReply = updatedComment.replies[updatedComment.replies.length - 1];

    res.json({ success: true, message: "Reply added!", reply: addedReply });
  } catch (error) {
    console.error("Add reply error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/posts/:id/share", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const alreadyShared = post.sharedBy.some(share => share.userId.toString() === userId.toString());
    if (alreadyShared) {
      return res.status(400).json({ success: false, message: "Already shared this post" });
    }

    post.sharedBy.push({ userId: userId, timestamp: new Date() });
    post.shares = post.sharedBy.length;
    await post.save();

    if (post.userId.toString() !== userId.toString()) {
      await User.findByIdAndUpdate(post.userId, {
        $push: {
          notifications: {
            type: "share",
            fromUserId: userId,
            postId: post._id,
            message: `${req.user.username} shared your post`,
            timestamp: new Date()
          }
        }
      });
    }

    res.json({ success: true, message: "Post shared!", shares: post.shares });
  } catch (error) {
    console.error("Share post error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/comments/:commentId/like", authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const post = await Post.findOne({ "comments._id": commentId });
    if (!post) return res.status(404).json({ success: false, message: "Comment not found" });

    const comment = post.comments.id(commentId);
    const alreadyLiked = comment.likedBy.includes(userId);

    if (alreadyLiked) {
      comment.likedBy.pull(userId);
    } else {
      comment.likedBy.push(userId);
    }

    comment.likes = comment.likedBy.length;
    await post.save();

    res.json({ 
      success: true, 
      message: alreadyLiked ? "Comment unliked!" : "Comment liked!", 
      likes: comment.likes,
      action: alreadyLiked ? 'unlike' : 'like'
    });
  } catch (error) {
    console.error("Like comment error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
