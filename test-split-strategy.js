const LogManager = require('./log-manager');
const fs = require('fs');
const path = require('path');

const testBaseDir = path.join(__dirname, 'test_split_strategy');

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function makeRecord(timestamp) {
  return {
    timestamp: timestamp || new Date().toISOString(),
    cpu: { usage: Math.random() * 100 },
    memory: { usage: Math.random() * 100 },
    disk: { usage: Math.random() * 100 },
    network: { upMB: Math.random() * 10, downMB: Math.random() * 10 },
    topProcesses: [{ name: 'test_process', cpu: 10, mem: 5 }]
  };
}

async function testDailyStrategy() {
  console.log('\n========== 测试 1: 纯按天分割 (daily) ==========');
  const testDir = path.join(testBaseDir, 'daily');
  cleanDir(testDir);

  const logManager = new LogManager({
    splitStrategy: 'daily',
    maxFileSize: 100 * 1024 * 1024,
    logDir: testDir,
    baseName: 'daily_log',
    flushInterval: 50,
    maxBufferedRecords: 10
  });

  await logManager.start();
  console.log('  ✓ 启动成功');
  const initialFile = path.basename(logManager.getCurrentFile());
  console.log(`  初始文件: ${initialFile}`);

  for (let i = 0; i < 30; i++) {
    logManager.addRecord(makeRecord());
  }
  await new Promise(resolve => setTimeout(resolve, 300));

  const files = logManager.getFileList();
  console.log(`  写入 30 条记录后文件数量: ${files.length}`);
  console.log(`  当前文件记录数: ${logManager.getCurrentRecordCount()}`);
  console.log(`  文件列表:`);
  files.forEach(f => console.log(`    - ${f.file}: ${f.recordCount} 条, ${(f.size / 1024).toFixed(2)} KB`));

  if (files.length !== 1) {
    throw new Error('按天分割应只有1个文件，实际有 ' + files.length + ' 个');
  }
  const fileName = files[0].file;
  if (!fileName.match(/daily_log_\d{4}-\d{2}-\d{2}\.jsonl/)) {
    throw new Error('文件名格式不正确: ' + fileName);
  }
  console.log('  ✓ 文件名格式正确: ' + fileName);

  await logManager.stop();
  console.log('  ✓ 纯按天分割测试通过!');
}

async function testSizeStrategy() {
  console.log('\n========== 测试 2: 纯按大小分割 (size) ==========');
  const testDir = path.join(testBaseDir, 'size');
  cleanDir(testDir);

  const logManager = new LogManager({
    splitStrategy: 'size',
    maxFileSize: 2 * 1024,
    maxRecordsPerFile: 0,
    logDir: testDir,
    baseName: 'size_log',
    flushInterval: 50,
    maxBufferedRecords: 10
  });

  await logManager.start();
  console.log('  ✓ 启动成功，单文件上限: 2 KB');

  for (let i = 0; i < 50; i++) {
    logManager.addRecord(makeRecord());
    if ((i + 1) % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  await new Promise(resolve => setTimeout(resolve, 500));

  const files = logManager.getFileList();
  console.log(`  写入 50 条记录后文件数量: ${files.length}`);
  const totalRecords = files.reduce((sum, f) => sum + f.recordCount, 0);
  console.log(`  总记录数: ${totalRecords}`);
  console.log(`  文件列表:`);
  files.forEach(f => console.log(`    - ${f.file}: ${f.recordCount} 条, ${(f.size / 1024).toFixed(2)} KB`));

  if (files.length < 2) {
    throw new Error('按大小分割应产生多个文件（>=2），实际只有 ' + files.length + ' 个');
  }

  const sizePatternOk = files.every(f =>
    f.file.match(/size_log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_\d+)?\.jsonl/)
  );
  if (!sizePatternOk) {
    throw new Error('部分文件名格式不符合 size 策略要求');
  }
  console.log('  ✓ 文件名格式正确（含时间戳+序号）');

  await logManager.stop();
  console.log('  ✓ 纯按大小分割测试通过!');
}

async function testHybridStrategy() {
  console.log('\n========== 测试 3: 按天+大小混合分割 (hybrid) ==========');
  const testDir = path.join(testBaseDir, 'hybrid');
  cleanDir(testDir);

  const logManager = new LogManager({
    splitStrategy: 'hybrid',
    maxFileSize: 3 * 1024,
    maxRecordsPerFile: 0,
    logDir: testDir,
    baseName: 'hybrid_log',
    flushInterval: 50,
    maxBufferedRecords: 10
  });

  await logManager.start();
  console.log('  ✓ 启动成功，单文件上限: 3 KB，混合模式');

  for (let i = 0; i < 60; i++) {
    logManager.addRecord(makeRecord());
    if ((i + 1) % 12 === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  await new Promise(resolve => setTimeout(resolve, 500));

  const files = logManager.getFileList();
  console.log(`  写入 60 条记录后文件数量: ${files.length}`);
  const totalRecords = files.reduce((sum, f) => sum + f.recordCount, 0);
  console.log(`  总记录数: ${totalRecords}`);
  console.log(`  文件列表:`);
  files.forEach(f => console.log(`    - ${f.file}: ${f.recordCount} 条, ${(f.size / 1024).toFixed(2)} KB`));

  if (files.length < 2) {
    throw new Error('混合模式按大小应产生多个文件（>=2），实际只有 ' + files.length + ' 个');
  }

  const hybridPatternOk = files.every(f =>
    f.file.match(/hybrid_log_\d{4}-\d{2}-\d{2}(?:_\d+)?\.jsonl/)
  );
  if (!hybridPatternOk) {
    throw new Error('部分文件名格式不符合 hybrid 策略要求');
  }
  console.log('  ✓ 文件名格式正确（日期+序号，按天分组）');

  await logManager.stop();
  console.log('  ✓ 混合分割测试通过!');
}

async function testIndexNumbering() {
  console.log('\n========== 测试 4: 序号避免冲突 ==========');
  const testDir = path.join(testBaseDir, 'indexing');
  cleanDir(testDir);

  const testFile1 = path.join(testDir, 'idx_log_2026-06-15.jsonl');
  const testFile2 = path.join(testDir, 'idx_log_2026-06-15_1.jsonl');
  fs.writeFileSync(testFile1, '{}');
  fs.writeFileSync(testFile2, '{}');
  console.log('  预创建 2 个同名文件测试序号递增');

  const fixedDateStr = '2026-06-15T12:00:00.000Z';
  const origToISO = Date.prototype.toISOString;
  Date.prototype.toISOString = function () { return fixedDateStr; };

  const logManager = new LogManager({
    splitStrategy: 'hybrid',
    maxFileSize: 10 * 1024 * 1024,
    logDir: testDir,
    baseName: 'idx_log',
    flushInterval: 50,
    maxBufferedRecords: 10
  });

  await logManager.start();
  const currentFile = path.basename(logManager.getCurrentFile());
  console.log(`  新创建的文件: ${currentFile}`);

  if (!currentFile.includes('_2')) {
    Date.prototype.toISOString = origToISO;
    await logManager.stop();
    throw new Error('序号未正确递增，期望文件名包含 _2，实际: ' + currentFile);
  }
  console.log('  ✓ 序号正确递增到 _2');

  Date.prototype.toISOString = origToISO;
  await logManager.stop();
  console.log('  ✓ 序号冲突测试通过!');
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      日志分割策略综合测试套件                 ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`测试目录: ${testBaseDir}\n`);

  try {
    await testDailyStrategy();
    await testSizeStrategy();
    await testHybridStrategy();
    await testIndexNumbering();

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║      ✓ 所有分割策略测试全部通过!              ║');
    console.log('╚══════════════════════════════════════════════╝');
    return true;
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    console.error(err.stack);
    return false;
  }
}

runAllTests().then(passed => {
  process.exit(passed ? 0 : 1);
});
