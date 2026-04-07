const express = require('express')
const { requireAuth } = require('../middleware/auth')
const legacy = require('./mealsLegacy')
const planner = require('./mealsPlanner')
const recipes = require('./mealsRecipes')
const combinations = require('./mealsCombinations')
const shopping = require('./mealsShopping')
const familySettings = require('./mealsFamilySettings')

const router = express.Router()
router.use(requireAuth)
router.use('/', legacy)
router.use('/planner', planner)
router.use('/family-portions', familySettings)
router.use('/recipes', recipes)
router.use('/combinations', combinations)
router.use('/shopping', shopping)

module.exports = router
