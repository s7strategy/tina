require('dotenv').config()

const { migrate } = require('../src/lib/db')

migrate()
  .then(() => {
    console.log('migrate ok')
    process.exit(0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
