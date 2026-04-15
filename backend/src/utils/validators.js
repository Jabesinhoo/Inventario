const bcrypt = require('bcryptjs');
const User = require('../models/usuario');
const { generateToken } = require('../middleware/auth');
const { validateLogin, validateRegister } = require('../utils/validators');
const logger = require('../utils/logger');

const login = async (req, res) => {
  try {
    const { error } = validateLogin(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password } = req.body;
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    await User.updateLastLogin(user.id);
    
    const token = generateToken(user);
    
    const userResponse = {
      id: user.id,
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    
    logger.info('[AUTH] User logged in', { email: user.email, role: user.role });
    
    res.json({
      message: 'Login successful',
      user: userResponse,
      token,
    });
  } catch (error) {
    logger.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const register = async (req, res) => {
  try {
    const { error } = validateRegister(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const existingUser = await User.findByEmail(req.body.email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const user = await User.create(req.body);
    
    const token = generateToken(user);
    
    logger.info('[AUTH] New user registered', { email: user.email });
    
    res.status(201).json({
      message: 'User registered successfully',
      user,
      token,
    });
  } catch (error) {
    logger.error('[AUTH] Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    logger.error('[AUTH] Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  login,
  register,
  getCurrentUser,
};