const Announcement = require('../models/Announcement.model');
const User = require('../models/User.model');
const mailer = require('../services/mailer.service');
const { success, error } = require('../utils/apiResponse');

// Send announcement email to all relevant users
const sendAnnouncementEmails = async (announcement) => {
  try {
    const roleFilter = announcement.targetRoles?.length > 0
      ? { role: { $in: announcement.targetRoles } }
      : {}; // empty targetRoles = all roles

    const users = await User.find({ isActive: true, ...roleFilter }).select('email name');
    const PRIORITY_LABELS = { low: '📢', medium: '📣', high: '🔔', urgent: '🚨' };
    const icon = PRIORITY_LABELS[announcement.priority] || '📢';

    for (const user of users) {
      await mailer.sendAnnouncementEmail(
        user.email,
        user.name,
        announcement.title,
        announcement.content,
        announcement.priority
      );
    }
  } catch (err) {
    console.error('Announcement email error:', err.message);
    // Don't throw — email failure should not block the API response
  }
};

// GET /api/announcements — all authenticated users
exports.getAnnouncements = async (req, res) => {
  try {
    const { role } = req.user;
    const { status, priority, page = 1, limit = 10 } = req.query;

    let query = {};
    if (role === 'superAdmin') {
      if (status) query.status = status;
    } else {
      // Non-superAdmin: only published, matching their role OR no targetRoles restriction
      query = {
        status: 'published',
        $or: [
          { targetRoles: { $size: 0 } },
          { targetRoles: role },
        ],
      };
    }

    if (priority) query.priority = priority;

    const total = await Announcement.countDocuments(query);
    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ announcements, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/announcements/:id
exports.getAnnouncementById = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    if (!announcement) return res.status(404).json({ message: 'Not found' });
    res.json({ announcement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/announcements — superAdmin only
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, status, targetRoles, expiresAt } = req.body;
    const announcement = await Announcement.create({
      title, content, priority, status, targetRoles, expiresAt,
      createdBy: req.user._id,
      publishedAt: status === 'published' ? new Date() : undefined,
    });

    // Send email if published immediately
    if (status === 'published') {
      sendAnnouncementEmails(announcement); // fire-and-forget
    }

    res.status(201).json({ announcement });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/announcements/:id — superAdmin only
exports.updateAnnouncement = async (req, res) => {
  try {
    const existing = await Announcement.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const wasNotPublished = existing.status !== 'published';
    const updates = { ...req.body, updatedBy: req.user._id };
    if (req.body.status === 'published' && wasNotPublished) {
      updates.publishedAt = new Date();
    }

    const announcement = await Announcement.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });

    // Send email if being published now for the first time
    if (req.body.status === 'published' && wasNotPublished) {
      sendAnnouncementEmails(announcement); // fire-and-forget
    }

    res.json({ announcement });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/announcements/:id — superAdmin only
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/announcements/:id/publish — superAdmin only
exports.publishAnnouncement = async (req, res) => {
  try {
    const existing = await Announcement.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const wasNotPublished = existing.status !== 'published';
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { status: 'published', publishedAt: new Date(), updatedBy: req.user._id },
      { new: true }
    );

    if (wasNotPublished) {
      sendAnnouncementEmails(announcement); // fire-and-forget
    }

    res.json({ announcement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};