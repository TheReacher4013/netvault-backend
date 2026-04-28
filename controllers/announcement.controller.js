const Announcement = require('../models/Announcement');

// GET /api/announcements — all authenticated users (filtered by role)
exports.getAnnouncements = async (req, res) => {
  try {
    const { role } = req.user;
    const { status, priority, page = 1, limit = 10 } = req.query;

    const query = {
      $or: [
        { targetRoles: { $size: 0 } }, // visible to all
        { targetRoles: role },
      ],
    };

    // Non-superadmin only see published
    if (role !== 'superadmin') query.status = 'published';
    else if (status) query.status = status;

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

// POST /api/announcements — superadmin only
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, status, targetRoles, expiresAt } = req.body;
    const announcement = await Announcement.create({
      title, content, priority, status, targetRoles, expiresAt,
      createdBy: req.user._id,
      publishedAt: status === 'published' ? new Date() : undefined,
    });
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/announcements/:id — superadmin only
exports.updateAnnouncement = async (req, res) => {
  try {
    const existing = await Announcement.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const updates = { ...req.body, updatedBy: req.user._id };
    if (req.body.status === 'published' && existing.status !== 'published') {
      updates.publishedAt = new Date();
    }

    const announcement = await Announcement.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });
    res.json({ announcement });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/announcements/:id — superadmin only
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/announcements/:id/publish — superadmin only
exports.publishAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { status: 'published', publishedAt: new Date(), updatedBy: req.user._id },
      { new: true }
    );
    if (!announcement) return res.status(404).json({ message: 'Not found' });
    res.json({ announcement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
