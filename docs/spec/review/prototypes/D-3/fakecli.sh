#!/bin/bash
# Fake "CLI" for experiment D-3. It starts four kinds of descendant, then waits to be ended.
#   a  a normal child
#   b  a background child started with nohup and &
#   c  a daemon: double fork, the grandchild calls setsid(), its parent exits at once
#   d  a process that keeps doing (c) in a fast loop for 2 s (one daemon every D_US microseconds, default 5000)
# Every descendant writes a heartbeat file every 200 ms, so a reader can tell whether it still runs.
# usage: [D_US=5000] fakecli.sh <workdir> <path-to-d3hb>
dir=$1
hb=$2
"$hb" beat "$dir/a.hb" &
nohup "$hb" beat "$dir/b.hb" >/dev/null 2>&1 &
"$hb" daemon "$dir/c.hb"
"$hb" loop "$dir/d" 2000 "${D_US:-5000}" &
echo $$ > "$dir/ready"
wait
