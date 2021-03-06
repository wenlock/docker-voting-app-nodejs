const common = require('./common')
const mongodb = require('mongodb')
const uuid = require('uuid/v1')

const Client = mongodb.MongoClient

class Database {
  /**
   * Create a new Database instance.
   * @param {object} [config] Object with valid url or uri property for connection string, or
   *                        else host, port, and db properties. Can also have an options property.
   * @throws {Error} if invalid config is provided.
   */
  constructor(config) {
    this._client = null
    this._instance = null
    this._isConnected = false
    this._config = Object.assign(common.DefaultConfig, config || {})
    checkConfig(this._config)
  }

  /**
   * Get a copy of the current config.
   * The config is an object with `host`, `port`, and `db` properties.
   * @return {{}|common.DefaultConfig}
   */
  get config() {
    return Object.assign({}, this._config)
  }

  /**
   * Get the connection URL based on the current config.
   * Returns value of url property if present, else returns value of uri property
   * if present, else returns generated string based on host, port, and db properties.
   * @return {string}
   */
  get connectionURL() {
    return this.config.url ?
      this.config.url :
      this.config.uri ?
        this.config.uri :
        `mongodb://${this.config.host}:${this.config.port}/${this.config.db}`
  }

  /**
   * Return true if a client connection has been established, otherwise false.
   * @return {boolean}
   */
  get isConnected() {
    return this._isConnected
  }

  /**
   * Return the actual connected client after connecting.
   * @return {*}
   */
  get client() {
    return this._client
  }

  /**
   * Return the actual database instance after connecting.
   * @return {*}
   */
  get instance() {
    return this._instance
  }

  /**
   * Establish a connection to the database.
   * @throws {Error} Connection error.
   * @return {Promise<void>}
   */
  async connect() {
    if (this._isConnected) {
      throw new Error('Already connected')
    }
    this._client = await Client.connect(this.connectionURL)
    this._instance = await this._client.db(this.config.db)
    this._isConnected = true
  }

  async close() {
    if (this._client) {
      await this._client.close()
      this._client = null
      this._instance = null
    }
    this._isConnected = false
  }

  /**
   * Insert or update a vote and return the new/updated doc including voter_id property.
   * @param {object} vote Must have a vote property set to either 'a' or 'b'.
   * @throws {Error} if vote is not valid.
   * @return {Promise<{}>}
   */
  async updateVote(vote) {
    if (!this.isConnected) {
      throw new Error('Not connected to database')
    }

    checkVote(vote)

    if (!vote.voter_id) {
      vote.voter_id = uuid()
    }

    let col = await this.instance.collection('votes')
    let result = await col.findOneAndUpdate({ voter_id: vote.voter_id },
      { $set: { vote: vote.vote }},
      { returnOriginal: false, sort: [['voter_id',1]], upsert: true })
    if (!result.ok) {
      throw new Error(JSON.stringify(result.lastErrorObject))
    }
    return result.value
  }

  /**
   * Get the tally of all 'a' and 'b' votes.
   * @return {Promise<{a: number, b: number}>}
   */
  async tallyVotes() {
    let col = await this.instance.collection('votes')
    let count_a = await col.count({ vote: 'a' })
    let count_b = await col.count({ vote: 'b' })
    return {
      a: count_a,
      b: count_b
    }
  }

}

module.exports = Database

function checkConfig(c) {
  let errors = []
  if (!c.url || !c.uri) {
    if (!c.host) errors.push('host')
    if (!c.port) errors.push('port')
    if (!c.db) errors.push('db')
  }
  if (errors.length) {
    // don't forget to update test if error string is updated
    throw new Error(`Invalid config. Provide a valid url (or uri) property value, or else valid values for the following: ${errors.join(', ')}`)
  }
}

function checkVote(vote) {
  let errors = []
  if (!vote) {
    errors.push('missing vote')
  } else {
    if (!vote.vote) {
      errors.push('missing vote property')
    } else {
      if (vote.vote !== 'a' && vote.vote !== 'b') {
        errors.push('invalid value for vote: (must be "a" or "b")')
      }
    }
  }
  if (errors.length) {
    // don't forget to update test if error string is updated
    throw new Error(`Invalid vote: ${errors.join(', ')}`)
  }
}
