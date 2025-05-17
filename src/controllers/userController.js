const User = require('../models/userModel');
const bcrypt = require('bcryptjs');

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user instance
    user = new User({
      username,
      email,
      password,
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save user to database
    await user.save();

    // Respond with the created user (excluding password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin (example)
const getUsers = async (req, res) => {
  // Placeholder for fetching all users
  res.status(200).json({ message: 'Fetched all users' });
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (example)
const getUserById = async (req, res) => {
  // Placeholder for fetching a single user
  res.status(200).json({ message: `Fetched user with ID ${req.params.id}` });
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (example)
const updateUser = async (req, res) => {
  // Placeholder for updating a user
  res.status(200).json({ message: `Updated user with ID ${req.params.id}` });
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (example)
const deleteUser = async (req, res) => {
  // Placeholder for deleting a user
  res.status(200).json({ message: `Deleted user with ID ${req.params.id}` });
};

module.exports = {
  registerUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
};
