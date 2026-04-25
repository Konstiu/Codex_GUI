const fs = require('fs')
const path = require('path')

if (process.platform !== 'darwin') {
  process.exit(0)
}

let nodePtyRoot
try {
  nodePtyRoot = path.dirname(require.resolve('node-pty/package.json'))
} catch {
  process.exit(0)
}

const prebuildsDir = path.join(nodePtyRoot, 'prebuilds')
const helperPaths = ['darwin-x64', 'darwin-arm64']
  .map(dir => path.join(prebuildsDir, dir, 'spawn-helper'))
  .filter(helperPath => fs.existsSync(helperPath))

for (const helperPath of helperPaths) {
  const stat = fs.statSync(helperPath)
  const executableMode = stat.mode | 0o755
  if ((stat.mode & 0o111) === 0o111) continue
  fs.chmodSync(helperPath, executableMode)
  console.log(`Made executable: ${path.relative(process.cwd(), helperPath)}`)
}
