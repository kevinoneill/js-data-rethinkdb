import {utils} from 'js-data'
import Adapter from 'js-data-adapter'
import {
  reserved
} from 'js-data-adapter'
import rethinkdbdash from 'rethinkdbdash'
import underscore from 'mout/string/underscore'

const {
  addHiddenPropsToTarget,
  classCallCheck,
  extend,
  fillIn,
  forOwn,
  isObject,
  isString,
  isUndefined,
  omit,
  plainCopy
} = utils

const withoutRelations = function (mapper, props) {
  return omit(props, mapper.relationFields || [])
}

const __super__ = Adapter.prototype

const DEFAULTS = {
  /**
   * RethinkDB authorization key.
   *
   * @name RethinkDBAdapter#authKey
   * @type {string}
   */
  authKey: '',

  /**
   * Buffer size for connection pool.
   *
   * @name RethinkDBAdapter#bufferSize
   * @type {number}
   * @default 10
   */
  bufferSize: 10,

  /**
   * Default database.
   *
   * @name RethinkDBAdapter#db
   * @type {string}
   * @default "test"
   */
  db: 'test',

  /**
   * RethinkDB host.
   *
   * @name RethinkDBAdapter#host
   * @type {string}
   * @default "localhost"
   */
  host: 'localhost',

  /**
   * Minimum connections in pool.
   *
   * @name RethinkDBAdapter#min
   * @type {number}
   * @default 10
   */
  min: 10,

  /**
   * Maximum connections in pool.
   *
   * @name RethinkDBAdapter#max
   * @type {number}
   * @default 50
   */
  max: 50,

  /**
   * RethinkDB port.
   *
   * @name RethinkDBAdapter#port
   * @type {number}
   * @default 28015
   */
  port: 28015
}

const INSERT_OPTS_DEFAULTS = {}
const UPDATE_OPTS_DEFAULTS = {}
const DELETE_OPTS_DEFAULTS = {}
const RUN_OPTS_DEFAULTS = {}

const equal = function (r, row, field, value) {
  return row(field).default(null).eq(value)
}

const notEqual = function (r, row, field, value) {
  return row(field).default(null).ne(value)
}

/**
 * Default predicate functions for the filtering operators.
 *
 * @name RethinkDBAdapter.OPERATORS
 * @property {Function} == Equality operator.
 * @property {Function} != Inequality operator.
 * @property {Function} > "Greater than" operator.
 * @property {Function} >= "Greater than or equal to" operator.
 * @property {Function} < "Less than" operator.
 * @property {Function} <= "Less than or equal to" operator.
 * @property {Function} isectEmpty Operator to test that the intersection
 * between two arrays is empty.
 * @property {Function} isectNotEmpty Operator to test that the intersection
 * between two arrays is NOT empty.
 * @property {Function} in Operator to test whether a value is found in the
 * provided array.
 * @property {Function} notIn Operator to test whether a value is NOT found in
 * the provided array.
 * @property {Function} contains Operator to test whether an array contains the
 * provided value.
 * @property {Function} notContains Operator to test whether an array does NOT
 * contain the provided value.
 */
const OPERATORS = {
  '==': equal,
  '===': equal,
  '!=': notEqual,
  '!==': notEqual,
  '>': function (r, row, field, value) {
    return row(field).default(null).gt(value)
  },
  '>=': function (r, row, field, value) {
    return row(field).default(null).ge(value)
  },
  '<': function (r, row, field, value) {
    return row(field).default(null).lt(value)
  },
  '<=': function (r, row, field, value) {
    return row(field).default(null).le(value)
  },
  'isectEmpty': function (r, row, field, value) {
    return row(field).default([]).setIntersection(r.expr(value).default([])).count().eq(0)
  },
  'isectNotEmpty': function (r, row, field, value) {
    return row(field).default([]).setIntersection(r.expr(value).default([])).count().ne(0)
  },
  'in': function (r, row, field, value) {
    return r.expr(value).default(r.expr([])).contains(row(field).default(null))
  },
  'notIn': function (r, row, field, value) {
    return r.expr(value).default(r.expr([])).contains(row(field).default(null)).not()
  },
  'contains': function (r, row, field, value) {
    return row(field).default([]).contains(value)
  },
  'notContains': function (r, row, field, value) {
    return row(field).default([]).contains(value).not()
  }
}

/**
 * RethinkDBAdapter class.
 *
 * @example
 * // Use Container instead of DataStore on the server
 * import {Container} from 'js-data'
 * import RethinkDBAdapter from 'js-data-rethinkdb'
 *
 * // Create a store to hold your Mappers
 * const store = new Container()
 *
 * // Create an instance of RethinkDBAdapter with default settings
 * const adapter = new RethinkDBAdapter()
 *
 * // Mappers in "store" will use the RethinkDB adapter by default
 * store.registerAdapter('rethinkdb', adapter, { default: true })
 *
 * // Create a Mapper that maps to a "user" table
 * store.defineMapper('user')
 *
 * @class RethinkDBAdapter
 * @extends Adapter
 * @param {Object} [opts] Configuration opts.
 * @param {string} [opts.authKey=""] RethinkDB authorization key.
 * @param {number} [opts.bufferSize=10] Buffer size for connection pool.
 * @param {string} [opts.db="test"] Default database.
 * @param {boolean} [opts.debug=false] Whether to log debugging information.
 * @param {string} [opts.host="localhost"] RethinkDB host.
 * @param {number} [opts.max=50] Maximum connections in pool.
 * @param {number} [opts.min=10] Minimum connections in pool.
 * @param {Object} [opts.operators] Override the default predicate functions for
 * specified operators.
 * @param {number} [opts.port=28015] RethinkDB port.
 * @param {boolean} [opts.raw=false] Whether to return a more detailed response object.
 */
function RethinkDBAdapter (opts) {
  const self = this
  classCallCheck(self, RethinkDBAdapter)
  opts || (opts = {})
  fillIn(opts, DEFAULTS)
  Adapter.call(self, opts)

  /**
   * Default options to pass to r#insert.
   *
   * @name RethinkDBAdapter#insertOpts
   * @type {Object}
   * @default {}
   */
  self.insertOpts || (self.insertOpts = {})
  fillIn(self.insertOpts, INSERT_OPTS_DEFAULTS)

  /**
   * Default options to pass to r#update.
   *
   * @name RethinkDBAdapter#updateOpts
   * @type {Object}
   * @default {}
   */
  self.updateOpts || (self.updateOpts = {})
  fillIn(self.updateOpts, UPDATE_OPTS_DEFAULTS)

  /**
   * Default options to pass to r#delete.
   *
   * @name RethinkDBAdapter#deleteOpts
   * @type {Object}
   * @default {}
   */
  self.deleteOpts || (self.deleteOpts = {})
  fillIn(self.deleteOpts, DELETE_OPTS_DEFAULTS)

  /**
   * Default options to pass to r#run.
   *
   * @name RethinkDBAdapter#runOpts
   * @type {Object}
   * @default {}
   */
  self.runOpts || (self.runOpts = {})
  fillIn(self.runOpts, RUN_OPTS_DEFAULTS)

  /**
   * Override the default predicate functions for specified operators.
   *
   * @name RethinkDBAdapter#operators
   * @type {Object}
   * @default {}
   */
  self.operators || (self.operators = {})

  /**
   * The rethinkdbdash instance used by this adapter. Use this directly when you
   * need to write custom queries.
   *
   * @name RethinkDBAdapter#r
   * @type {Object}
   */
  self.r = rethinkdbdash(opts)
  self.databases = {}
  self.tables = {}
  self.indices = {}
}

// Setup prototype inheritance from Adapter
RethinkDBAdapter.prototype = Object.create(Adapter.prototype, {
  constructor: {
    value: RethinkDBAdapter,
    enumerable: false,
    writable: true,
    configurable: true
  }
})

Object.defineProperty(RethinkDBAdapter, '__super__', {
  configurable: true,
  value: Adapter
})

/**
 * Alternative to ES6 class syntax for extending `RethinkDBAdapter`.
 *
 * @name RethinkDBAdapter.extend
 * @method
 * @param {Object} [instanceProps] Properties that will be added to the
 * prototype of the RethinkDBAdapter.
 * @param {Object} [classProps] Properties that will be added as static
 * properties to the RethinkDBAdapter itself.
 * @return {Object} RethinkDBAdapter of `RethinkDBAdapter`.
 */
RethinkDBAdapter.extend = extend

RethinkDBAdapter.OPERATORS = OPERATORS

addHiddenPropsToTarget(RethinkDBAdapter.prototype, {
  _handleErrors (cursor) {
    if (cursor && cursor.errors > 0) {
      if (cursor.first_error) {
        throw new Error(cursor.first_error)
      }
      throw new Error('Unknown RethinkDB Error')
    }
  },

  _create (mapper, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    const insertOpts = self.getOpt('insertOpts', opts)
    insertOpts.returnChanges = true

    return self.selectTable(mapper, opts)
      .insert(props, insertOpts)
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        self._handleErrors(cursor)
        let record
        if (cursor && cursor.changes && cursor.changes.length && cursor.changes[0].new_val) {
          record = cursor.changes[0].new_val
        }
        return [record, cursor]
      })
  },

  _createMany (mapper, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    const insertOpts = self.getOpt('insertOpts', opts)
    insertOpts.returnChanges = true

    return self.selectTable(mapper, opts)
      .insert(props, insertOpts)
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        self._handleErrors(cursor)
        let records = []
        if (cursor && cursor.changes && cursor.changes.length && cursor.changes) {
          records = cursor.changes.map(function (change) {
            return change.new_val
          })
        }
        return [records, cursor]
      })
  },

  _destroy (mapper, id, opts) {
    const self = this
    opts || (opts = {})

    return self.selectTable(mapper, opts)
      .get(id)
      .delete(self.getOpt('deleteOpts', opts))
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        self._handleErrors(cursor)
        return [undefined, cursor]
      })
  },

  _destroyAll (mapper, query, opts) {
    const self = this
    query || (query = {})
    opts || (opts = {})

    return self
      .filterSequence(self.selectTable(mapper, opts), query)
      .delete(self.getOpt('deleteOpts', opts))
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        self._handleErrors(cursor)
        return [undefined, cursor]
      })
  },

  _find (mapper, id, opts) {
    const self = this
    opts || (opts = {})

    return self.selectTable(mapper, opts)
      .get(id)
      .run(self.getOpt('runOpts', opts)).then(function (record) {
        return [record, {}]
      })
  },

  _findAll (mapper, query, opts) {
    const self = this
    opts || (opts = {})
    query || (query = {})

    return self.filterSequence(self.selectTable(mapper, opts), query)
      .run(self.getOpt('runOpts', opts)).then(function (records) {
        return [records, {}]
      })
  },

  _update (mapper, id, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    const updateOpts = self.getOpt('updateOpts', opts)
    updateOpts.returnChanges = true

    return self.selectTable(mapper, opts)
      .get(id)
      .update(withoutRelations(mapper, props), updateOpts)
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        let record
        self._handleErrors(cursor)
        if (cursor && cursor.changes && cursor.changes.length && cursor.changes[0].new_val) {
          record = cursor.changes[0].new_val
        } else {
          throw new Error('Not Found')
        }
        return [record, cursor]
      })
  },

  _updateAll (mapper, props, query, opts) {
    const self = this
    props || (props = {})
    query || (query = {})
    opts || (opts = {})

    const updateOpts = self.getOpt('updateOpts', opts)
    updateOpts.returnChanges = true

    return self.filterSequence(self.selectTable(mapper, opts), query)
      .update(withoutRelations(mapper, props), updateOpts)
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        let records = []
        self._handleErrors(cursor)
        if (cursor && cursor.changes && cursor.changes.length) {
          records = cursor.changes.map(function (change) { return change.new_val })
        }
        return [records, cursor]
      })
  },

  _updateMany (mapper, records, opts) {
    const self = this
    records || (records = [])
    opts || (opts = {})

    const insertOpts = self.getOpt('insertOpts', opts)
    insertOpts.returnChanges = true
    insertOpts.conflict = 'update'

    return self.selectTable(mapper, opts)
      .insert(records, insertOpts)
      .run(self.getOpt('runOpts', opts)).then(function (cursor) {
        records = []
        self._handleErrors(cursor)
        if (cursor && cursor.changes && cursor.changes.length) {
          records = cursor.changes.map(function (change) { return change.new_val })
        }
        return [records, cursor]
      })
  },

  selectDb (opts) {
    return this.r.db(isUndefined(opts.db) ? this.db : opts.db)
  },

  selectTable (mapper, opts) {
    return this.selectDb(opts).table(mapper.table || underscore(mapper.name))
  },

  /**
   * Apply the specified selection query to the provided RQL sequence.
   *
   * @name RethinkDBAdapter#filterSequence
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object} [query] Selection query.
   * @param {Object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.operators] Override the default predicate functions
   * for specified operators.
   */
  filterSequence (sequence, query, opts) {
    const self = this
    const r = self.r

    query = plainCopy(query || {})
    opts || (opts = {})
    opts.operators || (opts.operators = {})
    query.where || (query.where = {})
    query.orderBy || (query.orderBy = query.sort)
    query.orderBy || (query.orderBy = [])
    query.skip || (query.skip = query.offset)

    // Transform non-keyword properties to "where" clause configuration
    forOwn(query, function (config, keyword) {
      if (reserved.indexOf(keyword) === -1) {
        if (isObject(config)) {
          query.where[keyword] = config
        } else {
          query.where[keyword] = {
            '==': config
          }
        }
        delete query[keyword]
      }
    })

    let rql = sequence

    // Filter
    if (Object.keys(query.where).length !== 0) {
      // Filter sequence using filter function
      rql = rql.filter(function (row) {
        let subQuery
        // Apply filter for each field
        forOwn(query.where, function (criteria, field) {
          if (!isObject(criteria)) {
            criteria = { '==': criteria }
          }
          // Apply filter for each operator
          forOwn(criteria, function (value, operator) {
            let isOr = false
            if (operator && operator[0] === '|') {
              operator = operator.substr(1)
              isOr = true
            }
            let predicateFn = self.getOperator(operator, opts)
            if (predicateFn) {
              const predicateResult = predicateFn(r, row, field, value)
              if (isOr) {
                subQuery = subQuery ? subQuery.or(predicateResult) : predicateResult
              } else {
                subQuery = subQuery ? subQuery.and(predicateResult) : predicateResult
              }
            } else {
              throw new Error(`Operator ${operator} not supported!`)
            }
          })
        })
        return subQuery || true
      })
    }

    // Sort
    if (query.orderBy) {
      if (isString(query.orderBy)) {
        query.orderBy = [
          [query.orderBy, 'asc']
        ]
      }
      for (var i = 0; i < query.orderBy.length; i++) {
        if (isString(query.orderBy[i])) {
          query.orderBy[i] = [query.orderBy[i], 'asc']
        }
        rql = (query.orderBy[i][1] || '').toUpperCase() === 'DESC' ? rql.orderBy(r.desc(query.orderBy[i][0])) : rql.orderBy(query.orderBy[i][0])
      }
    }

    // Offset
    if (query.skip) {
      rql = rql.skip(+query.skip)
    }

    // Limit
    if (query.limit) {
      rql = rql.limit(+query.limit)
    }

    return rql
  },

  waitForDb (opts) {
    const self = this
    opts || (opts = {})
    const db = isUndefined(opts.db) ? self.db : opts.db
    if (!self.databases[db]) {
      self.databases[db] = self.r.branch(
        self.r.dbList().contains(db),
        true,
        self.r.dbCreate(db)
      ).run()
    }
    return self.databases[db]
  },

  waitForTable (mapper, options) {
    const table = isString(mapper) ? mapper : (mapper.table || underscore(mapper.name))
    options = options || {}
    let db = isUndefined(options.db) ? this.db : options.db
    return this.waitForDb(options).then(() => {
      this.tables[db] = this.tables[db] || {}
      if (!this.tables[db][table]) {
        this.tables[db][table] = this.r.branch(this.r.db(db).tableList().contains(table), true, this.r.db(db).tableCreate(table)).run()
      }
      return this.tables[db][table]
    })
  },

  waitForIndex (table, index, options) {
    options = options || {}
    let db = isUndefined(options.db) ? this.db : options.db
    return this.waitForDb(options).then(() => this.waitForTable(table, options)).then(() => {
      this.indices[db] = this.indices[db] || {}
      this.indices[db][table] = this.indices[db][table] || {}
      if (!this.tables[db][table][index]) {
        this.tables[db][table][index] = this.r.branch(this.r.db(db).table(table).indexList().contains(index), true, this.r.db(db).table(table).indexCreate(index)).run().then(() => {
          return this.r.db(db).table(table).indexWait(index).run()
        })
      }
      return this.tables[db][table][index]
    })
  },

  /**
   * Create a new record.
   *
   * @name RethinkDBAdapter#create
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object} props The record to be created.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.insertOpts] Options to pass to r#insert.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  create (mapper, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.create.call(self, mapper, props, opts)
    })
  },

  /**
   * Create multiple records in a single batch.
   *
   * @name RethinkDBAdapter#createMany
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object} props The records to be created.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.insertOpts] Options to pass to r#insert.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  createMany (mapper, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.createMany.call(self, mapper, props, opts)
    })
  },

  /**
   * Destroy the record with the given primary key.
   *
   * @name RethinkDBAdapter#destroy
   * @method
   * @param {Object} mapper The mapper.
   * @param {(string|number)} id Primary key of the record to destroy.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.deleteOpts] Options to pass to r#delete.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  destroy (mapper, id, opts) {
    const self = this
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.destroy.call(self, mapper, id, opts)
    })
  },

  /**
   * Destroy the records that match the selection query.
   *
   * @name RethinkDBAdapter#destroyAll
   * @method
   * @param {Object} mapper the mapper.
   * @param {Object} [query] Selection query.
   * @param {Object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.deleteOpts] Options to pass to r#delete.
   * @param {Object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  destroyAll (mapper, query, opts) {
    const self = this
    opts || (opts = {})
    query || (query = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.destroyAll.call(self, mapper, query, opts)
    })
  },

  /**
   * Retrieve the record with the given primary key.
   *
   * @name RethinkDBAdapter#find
   * @method
   * @param {Object} mapper The mapper.
   * @param {(string|number)} id Primary key of the record to retrieve.
   * @param {Object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @param {string[]} [opts.with=[]] Relations to eager load.
   * @return {Promise}
   */
  find (mapper, id, opts) {
    const self = this
    opts || (opts = {})
    opts.with || (opts.with = [])

    const relationList = mapper.relationList || []
    let tasks = [self.waitForTable(mapper, opts)]

    relationList.forEach(function (def) {
      const relationName = def.relation
      const relationDef = def.getRelation()
      if (!opts.with || opts.with.indexOf(relationName) === -1) {
        return
      }
      if (def.foreignKey && def.type !== 'belongsTo') {
        if (def.type === 'belongsTo') {
          tasks.push(self.waitForIndex(mapper.table || underscore(mapper.name), def.foreignKey, opts))
        } else {
          tasks.push(self.waitForIndex(relationDef.table || underscore(relationDef.name), def.foreignKey, opts))
        }
      }
    })
    return Promise.all(tasks).then(function () {
      return __super__.find.call(self, mapper, id, opts)
    })
  },

  /**
   * Retrieve the records that match the selection query.
   *
   * @name RethinkDBAdapter#findAll
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object} [query] Selection query.
   * @param {Object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @param {string[]} [opts.with=[]] Relations to eager load.
   * @return {Promise}
   */
  findAll (mapper, query, opts) {
    const self = this
    opts || (opts = {})
    opts.with || (opts.with = [])
    query || (query = {})

    const relationList = mapper.relationList || []
    let tasks = [self.waitForTable(mapper, opts)]

    relationList.forEach(function (def) {
      const relationName = def.relation
      const relationDef = def.getRelation()
      if (!opts.with || opts.with.indexOf(relationName) === -1) {
        return
      }
      if (def.foreignKey && def.type !== 'belongsTo') {
        if (def.type === 'belongsTo') {
          tasks.push(self.waitForIndex(mapper.table || underscore(mapper.name), def.foreignKey, opts))
        } else {
          tasks.push(self.waitForIndex(relationDef.table || underscore(relationDef.name), def.foreignKey, opts))
        }
      }
    })
    return Promise.all(tasks).then(function () {
      return __super__.findAll.call(self, mapper, query, opts)
    })
  },

  /**
   * Resolve the predicate function for the specified operator based on the
   * given options and this adapter's settings.
   *
   * @name RethinkDBAdapter#getOperator
   * @method
   * @param {string} operator The name of the operator.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @return {*} The predicate function for the specified operator.
   */
  getOperator (operator, opts) {
    opts || (opts = {})
    opts.operators || (opts.operators = {})
    let ownOps = this.operators || {}
    return isUndefined(opts.operators[operator]) ? ownOps[operator] || OPERATORS[operator] : opts.operators[operator]
  },

  /**
   * Apply the given update to the record with the specified primary key.
   *
   * @name RethinkDBAdapter#update
   * @method
   * @param {Object} mapper The mapper.
   * @param {(string|number)} id The primary key of the record to be updated.
   * @param {Object} props The update to apply to the record.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.updateOpts] Options to pass to r#update.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  update (mapper, id, props, opts) {
    const self = this
    props || (props = {})
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.update.call(self, mapper, id, props, opts)
    })
  },

  /**
   * Apply the given update to all records that match the selection query.
   *
   * @name RethinkDBAdapter#updateAll
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object} props The update to apply to the selected records.
   * @param {Object} [query] Selection query.
   * @param {Object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @param {Object} [opts.updateOpts] Options to pass to r#update.
   * @return {Promise}
   */
  updateAll (mapper, props, query, opts) {
    const self = this
    props || (props = {})
    query || (query = {})
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.updateAll.call(self, mapper, props, query, opts)
    })
  },

  /**
   * Update the given records in a single batch.
   *
   * @name RethinkDBAdapter#updateMany
   * @method
   * @param {Object} mapper The mapper.
   * @param {Object[]} records The records to update.
   * @param {Object} [opts] Configuration options.
   * @param {Object} [opts.insertOpts] Options to pass to r#insert.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {Object} [opts.runOpts] Options to pass to r#run.
   * @return {Promise}
   */
  updateMany (mapper, records, opts) {
    const self = this
    records || (records = [])
    opts || (opts = {})

    return self.waitForTable(mapper, opts).then(function () {
      return __super__.updateMany.call(self, mapper, records, opts)
    })
  }
})

module.exports = RethinkDBAdapter
