import cluster from 'node:cluster'

if (cluster.isPrimary) {
  import('./cluster/primary.js')
} else {
  import('./cluster/worker.js')
}
