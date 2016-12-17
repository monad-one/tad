/* @flow */

import db from 'sqlite'
import test from 'tape'
import deepEqualSnap from './tapeSnap'
import * as _ from 'lodash'
import * as reltab from '../src/reltab'
import * as reltabSqlite from '../src/reltab-sqlite'
import * as csvimport from '../src/csvimport'
import * as util from './reltabTestUtils'
import * as aggtree from '../src/aggtree'
import PivotTreeModel from '../src/PivotTreeModel'
const {col, constVal} = reltab

var sharedRtc
const testPath = 'csv/barttest.csv'

const q1 = reltab.tableQuery('barttest')

var tcoeSum

const sqliteTestSetup = () => {
  test('sqlite test setup', t => {
    db.open(':memory:')
      .then(() => csvimport.importSqlite(testPath))
      .then(md => reltabSqlite.init(db, md, {showQueries: true}))
      .then(rtc => {
        sharedRtc = rtc
        console.log('set rtc: ', sharedRtc)
        t.ok(true, 'setup and import complete')
        t.end()
      })
      .catch(err => console.error('sqliteTestSetup failure: ', err, err.stack))
  })
}

const sqliteTestShutdown = () => {
  test('sqlite test setup', t => {
    db.close()
      .then(() => {
        t.ok(true, 'finished db.close')
        t.end()
        process.exit(0)
      })
  })
}

const dbTest0 = () => {
  test('basic table query', t => {
    const rtc = sharedRtc // Note: need to ensure we only read sharedRtc inside test()
    console.log('dbTest0: test start: ', rtc)
    rtc.evalQuery(q1)
    .then(res => {
      t.ok(true, 'basic table read')
      var schema = res.schema
      var expectedCols = [ 'Name', 'Title', 'Base', 'TCOE', 'JobFamily', 'Union' ]

      const columns = schema.columns // array of strings
      // console.log('columns: ', columns)

      t.deepEqual(columns, expectedCols, 'getSchema column ids')

      const columnTypes = columns.map(colId => schema.columnType(colId))
      var expectedColTypes = [ 'text', 'text', 'integer', 'integer', 'text', 'text' ]
      t.deepEqual(columnTypes, expectedColTypes, 'getSchema column types')

      const rowData = res.rowData
      t.equal(rowData.length, 23, 'q1 rowData.length')

      // console.log(rowData[0])
      var expRow0 = [ 'Crunican, Grace', 'General Manager', 312461, 399921, 'Executive Management', 'Non-Represented' ]
      t.deepEqual(rowData[0], expRow0, 'first row matches expected')

      tcoeSum = util.columnSum(res, 'TCOE')
      console.log('TCOE sum: ', tcoeSum)

      t.end()
    })
  })
}

const pcols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE']
const q2 = q1.project(pcols)

const dbTest2 = () => {
  test('basic project operator', t => {
    const rtc = sharedRtc
    t.plan(3)
    // console.log('q2: ', q2)
    rtc.evalQuery(q2).then(res => {
      t.ok(true, 'project query returned success')
      // console.log('project query schema: ', res.schema)
      t.deepEqual(res.schema.columns, pcols, 'result schema from project')

      // console.log(res.rowData[0])
      var expRow0 = ['Executive Management', 'General Manager', 'Non-Represented', 'Crunican, Grace', 312461, 399921]

      t.deepEqual(res.rowData[0], expRow0, 'project result row 0')
      t.end()
    })
  })
}

const q3 = q1.groupBy(['Job', 'Title'], ['TCOE'])  // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

const dbTest3 = () => {
  test('basic groupBy', t => {
    const rtc = sharedRtc
    rtc.evalQuery(q3).then(res => {
      // console.log('groupBy result: ', res)

      const expCols = ['Job', 'Title', 'TCOE']
      t.deepEqual(res.schema.columns, expCols, 'groupBy query schema')

      t.deepEqual(res.rowData.length, 18, 'correct number of grouped rows')

      const groupSum = util.columnSum(res, 'TCOE')
      t.equal(groupSum, tcoeSum, 'grouped TCOE sum matches raw sum')
      t.end()
    })
  })
}

const q4 = q2.groupBy(['JobFamily'], ['Title', 'Union', 'Name', 'Base', 'TCOE'])

const dbTest4 = () => {
  test('groupBy aggs', t => {
    const rtc = sharedRtc
    rtc.evalQuery(q4).then(res => {
      console.log('group by job family: ')
      util.logTable(res)

      var rs = res.schema

      const expCols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE']
      t.deepEqual(rs.columns, expCols)

      t.deepEqual(res.rowData.length, 8, 'number of grouped rows in q4 result')

      const groupSum = util.columnSum(res, 'TCOE')
      t.deepEqual(groupSum, tcoeSum, 'tcoe sum after groupBy')
      t.end()
    }, util.mkAsyncErrHandler(t, 'evalQuery q4'))
  })
}

const sqliteQueryTest = (label: string, query: reltab.QueryExp,
                          cf: (t: any, res: reltab.TableRep) => void): void => {
  test(label, t => {
    const rtc = sharedRtc
    rtc.evalQuery(query).then(res => cf(t, res), util.mkAsyncErrHandler(t, label))
  })
}

const q5 = q1.filter(reltab.and().eq(col('JobFamily'), constVal('Executive Management')))

const dbTest5 = () => {
  sqliteQueryTest('basic filter', q5, (t, res) => {
    t.equal(res.rowData.length, 4, 'expected row count after filter')
    util.logTable(res)
    t.end()
  })
}

const serTest0 = () => {
  let dq5
  test('query deserialization', t => {
    const ser5 = JSON.stringify(q5, null, 2)
    console.log('serialized query')
    console.log(ser5)
    dq5 = reltab.deserializeQuery(ser5)
    console.log('deserialized query: ', dq5)
    const rtc = sharedRtc
    rtc.evalQuery(dq5)
      .then(res => {
        console.log('got results of evaluating deserialized query')
        util.logTable(res)
        t.equal(res.rowData.length, 4, 'expected row count after filter')
        t.end()
      }, util.mkAsyncErrHandler(t, 'query deserialization'))
  })
}

const q6 = q1.mapColumns({Name: {id: 'EmpName', displayName: 'Employee Name'}})

const dbTest6 = () => {
  sqliteQueryTest('mapColumns', q6, (t, res) => {
    const rs = res.schema
    t.ok(rs.columns[0], 'EmpName', 'first column key is employee name')
    const em = rs.columnMetadata['EmpName']
    t.deepEqual(em, {type: 'text', displayName: 'Employee Name'}, 'EmpName metadata')
    t.equal(res.rowData.length, 23, 'expected row count after mapColumns')
    t.end()
  })
}

const q7 = q1.mapColumnsByIndex({'0': {id: 'EmpName'}})

const dbTest7 = () => {
  sqliteQueryTest('mapColumnsByIndex', q7, (t, res) => {
    const rs = res.schema
    t.ok(rs.columns[0], 'EmpName', 'first column key is employee name')
    t.equal(res.rowData.length, 23, 'expected row count after mapColumnsByIndex')
    t.end()
  })
}

const q8 = q5.concat(q1.filter(reltab.and().eq(col('JobFamily'), constVal('Safety'))))

const dbTest8 = () => {
  sqliteQueryTest('concat', q8, (t, res) => {
    t.equal(res.rowData.length, 5, 'expected row count after filter and concat')
    const jobCol = res.getColumn('JobFamily')
    const jobs = _.sortedUniq(jobCol)
    t.deepEqual(jobs, ['Executive Management', 'Safety'], 'filter and concat column vals')
    t.end()
  })
}

const q9 = q8.sort([['Name', true]])
const dbTest9 = () => {
  sqliteQueryTest('basic sort', q9, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const q10 = q8.sort([['JobFamily', true], ['TCOE', false]])
const dbTest10 = () => {
  sqliteQueryTest('compound key sort', q10, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const q11 = q8.extend('ExtraComp', {type: 'integer'}, 'TCOE - Base')
const dbTest11 = () => {
  sqliteQueryTest('extend with expression', q11, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const aggTreeTest0 = () => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  test('initial aggTree test', t => {
    const rtc = sharedRtc
    const p0 = aggtree.vpivot(rtc, q0, ['JobFamily', 'Title'], 'Name', true, [])

    p0.then(tree0 => {
      console.log('vpivot initial promise resolved...')
      const rq0 = tree0.rootQuery
      rtc.evalQuery(rq0)
        .then(res => {
          console.log('root query: ')
          util.logTable(res)

          const q1 = tree0.applyPath([])
          return rtc.evalQuery(q1)
        })
        .then(res => {
          console.log('open root query: ')
          util.logTable(res)
          const expCols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE', 'Rec', '_depth', '_pivot', '_isRoot', '_path0', '_path1']

          t.deepEqual(res.schema.columns, expCols, 'Q1 schema columns')
          t.deepEqual(res.rowData.length, 8, 'Q1 rowData length')

          const actSum = util.columnSum(res, 'TCOE')

          t.deepEqual(actSum, 4638335, 'Q1 rowData sum(TCOE)')

          const q2 = tree0.applyPath([ 'Executive Management' ])
          return rtc.evalQuery(q2)
        })
        .then(res => {
          console.log('after opening path "Executive Management":')
          util.logTable(res)

          const q3 = tree0.applyPath(['Executive Management', 'General Manager'])
          return rtc.evalQuery(q3)
        })
        .then(res => {
          console.log('after opening path /Executive Management/General Manager:')
          util.logTable(res)

          // const openPaths = {'Executive Management': {'General Manager': {}}, 'Safety': {}}
          const openPaths = {'Executive Management': {}}
          const q4 = tree0.getTreeQuery(openPaths)
          return rtc.evalQuery(q4)
        })
        .then(res => {
          console.log('evaluating query returned from getTreeQuery:')
          util.logTable(res)
        })
        .then(() => t.end())
        .catch(util.mkAsyncErrHandler(t, 'aggtree queries chain'))
    }).catch(util.mkAsyncErrHandler(t, 'initial vpivot'))
  })
}

const aggTreeTest1 = () => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  test('sorted aggTree test', t => {
    const rtc = sharedRtc
    const p0 = aggtree.vpivot(rtc, q0, ['JobFamily', 'Title'], 'Name', true,
                [['TCOE', false], ['Base', true], ['Title', true]])

    p0.then(tree0 => {
      console.log('vpivot initial promise resolved...')

      const sq1 = tree0.getSortQuery(1)

      rtc.evalQuery(sq1)
        .then(res => {
          console.log('sort query depth 1: ')
          util.logTable(res)
        })
        .then(() => {
          const sq2 = tree0.getSortQuery(2)

          return rtc.evalQuery(sq2)
        })
        .then(res2 => {
          console.log('sort query depth 2: ')
          util.logTable(res2)
        })
        .then(() => {
          const q1 = tree0.applyPath([])
          const sq1 = tree0.getSortQuery(1)

          console.log('got depth 1 query and sortQuery, joining...: ')
          const jq1 = q1.join(sq1, '_path0')

          return rtc.evalQuery(jq1)
        })
        .then(res => {
          console.log('result of join query: ')
          util.logTable(res)
        })
        .then(() => t.end())
        .catch(util.mkAsyncErrHandler(t, 'aggtree queries chain'))
    }).catch(util.mkAsyncErrHandler(t, 'initial vpivot'))
  })
}

const getRawColumn = (rawData: Array<any>, cid: string): Array<any> => {
  return rawData.map(row => row[cid])
}

// expected pivot column when pivoted by JobFamily
const expPivotCol = [
  'Engineering & Systems Engineering',
  'Executive Management',
  'Finance & Accounting',
  'Legal & Paralegal',
  'Maintenance, Vehicle & Facilities',
  'Police',
  'Safety',
  'Transportation Operations'
]

// Test created for bug #3
// Test: Sort by a text column while pivoted:

const pivotSortTest0 = () => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  test('Pivot Sort Test', t => {
    const rtc = sharedRtc
    const ptm = new PivotTreeModel(rtc, q0, ['JobFamily'], null, false)
    const p0 = ptm.refresh()
    p0.then(dv0 => {
      console.log('ptm.refresh promise resolved...')
      // console.log('dataView: ')
      // console.table(dv0.rawData)
      const pivotColumn = getRawColumn(dv0.rawData, '_pivot')
      console.log('pivot column: ', pivotColumn)
      t.deepEqual(pivotColumn, expPivotCol, 'initial pivot column matches expected')

      // Now sort by Title:
      // ptm.setSort('Title', 1)
      console.log('after sort: ')
      console.table(dv0.rawData)
      const sortedPivotCol = getRawColumn(dv0.rawData, '_pivot')
      // For this data set, uniq agg on Title is null for all Job Family rows,
      // so sorting by Title should not affect order of pivot col:
      t.deepEqual(sortedPivotCol, expPivotCol, 'sorting by title does not affect pivot col')
      t.end()
    })
  })
}

// Let's try async / await:
const asyncTest1 = () => {
  const q0 = reltab.tableQuery('barttest').project(pcols)

  const tf = async (t) => {
    const rtc = sharedRtc
    const res0 = await rtc.evalQuery(q0)
    console.log('tf: got result:')
    console.log(res0.rowData[0], '\n...')
    console.log('done logging table')
    t.ok(true, 'handle async result')
    t.end()
  }

  test('basic async test', t =>
    tf(t).catch(util.mkAsyncErrHandler(t, 'basic async test')))
}

const asyncAggTreeSortTest = () => {
  const tf = async (t) => {
    const q0 = reltab.tableQuery('barttest').project(pcols)
    const rtc = sharedRtc
    const tree0 = await aggtree.vpivot(rtc, q0, ['JobFamily', 'Title'], 'Name', true,
                    [['TCOE', false], ['Base', true], ['Title', true]])
    console.log('vpivot initial promise resolved...')

    const sq1 = tree0.getSortQuery(1)

    const res1 = await rtc.evalQuery(sq1)
    console.log('sort query depth 1: ')
    util.logTable(res1)

    const sq2 = tree0.getSortQuery(2)

    const res2 = await rtc.evalQuery(sq2)

    console.log('sort query depth 2: ')
    util.logTable(res2, {maxRows: 25})

    // take sq1 and join with query of depth 1:
    const q1 = tree0.applyPath([])
    const jq1 = q1.join(sq1, ['_path0'])

    const jres1 = await rtc.evalQuery(jq1)

    console.log('join result for depth 1: ')
    util.logTable(jres1, {maxRows: 25})

    const q2 = tree0.applyPath([ 'Executive Management' ])
    const jq2 = q2.join(sq1, ['_path0']).join(sq2, ['_path0', '_path1'])

    const jres2 = await rtc.evalQuery(jq2)

    console.log('level 2 join result:')
    util.logTable(jres2, {maxRows: 25})

    const openPaths = {'Executive Management': {'General Manager': {}}, 'Safety': {}}
    // const openPaths = {'Executive Management': {}}
    const q4 = tree0.getTreeQuery(openPaths)
    const res4 = await rtc.evalQuery(q4)

    console.log('tree query after opening paths:')
    util.logTable(res4, {maxRows: 50})

    const jq4 = q4.join(sq1, ['_path0']).join(sq2, ['_path0', '_path1'])
    const jres4 = await rtc.evalQuery(jq4)

    console.log('tree query after sort joins:')
    util.logTable(jres4, {maxRows: 50})

    const stq = tree0.getSortedTreeQuery(openPaths)
    const sres = await rtc.evalQuery(stq)

    console.log('result of sorted tree query:')
    util.logTable(sres, {maxRows: 50})

    t.ok(true, 'finished getting sort tables')
    t.end()
  }

  test('asyncAggTreeSortTest', t =>
    tf(t).catch(util.mkAsyncErrHandler(t, 'async aggree sort test')))
}

const asyncTest = (testName, tf) => {
  return test(testName, t =>
      tf(t).catch(util.mkAsyncErrHandler(t, testName)))
}

/*
 * A bad case we encountered interactively: Pivot by JobFamily, sort by Title
 */
const basicPivotSortTest = async (t) => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  const rtc = sharedRtc
  const tree0 = await aggtree.vpivot(rtc, q0, ['JobFamily'], 'Name', true,
                  [['Title', true]])
  console.log('vpivot initial promise resolved...')

  const openPaths = {'Legal & Paralegal': {}}

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query matches snapshot')

  t.end()
}

/*
 * Same as basicPivotSortTest, but title in descending order.
 *
 * Has shown issues with wrong sort order in the wild:
 */
const descPivotSortTest = async (t) => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  const rtc = sharedRtc
  const tree0 = await aggtree.vpivot(rtc, q0, ['JobFamily'], 'Name', true,
                 [['Title', false]])
  console.log('vpivot initial promise resolved...')

  const pq = tree0.applyPath([])

  const baseRes = await rtc.evalQuery(pq)

  console.log('baseRes:')
  util.logTable(baseRes)

  const openPaths = {'Legal & Paralegal': {}}

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query matches snapshot')

  t.end()
}

/*
 * Multiple levels of pivot, single sort column:
 */
const multiPivotSingleSortTest = async (t) => {
  const q0 = reltab.tableQuery('barttest').project(pcols)
  const rtc = sharedRtc
  const tree0 = await aggtree.vpivot(rtc, q0, ['JobFamily', 'Title'], 'Name', true,
                 [['Title', true]])
  console.log('vpivot initial promise resolved...')

  const openPaths = {'Legal & Paralegal': {}}

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query')

  t.end()
}

const doit = false

const runTests = () => {
  sqliteTestSetup()

  if (doit) {
    dbTest0()
    dbTest2()
    dbTest3()
    dbTest4()
    dbTest5()
    serTest0()
    dbTest6()
    dbTest7()
    dbTest8()
    dbTest9()

    dbTest10()
    dbTest11()

    aggTreeTest0()

    aggTreeTest1()
    asyncTest1()

    asyncAggTreeSortTest()

    pivotSortTest0()
  }

  asyncTest('basicPivotSortTest', basicPivotSortTest)

  asyncTest('descPivotSortTest', descPivotSortTest)

  asyncTest('multiPivotSingleSortTest', multiPivotSingleSortTest)

  sqliteTestShutdown()
}

runTests()
