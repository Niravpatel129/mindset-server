const express = require('express');
const router = express.Router();
const {
  registerUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

// Route for registering a new user
router.post('/', registerUser);

// Route for getting all users
router.get('/', getUsers);

// Route for getting a single user by ID
router.get('/:id', getUserById);

// Route for updating a user by ID
router.put('/:id', updateUser);

// Route for deleting a user by ID
router.delete('/:id', deleteUser);

module.exports = router;
