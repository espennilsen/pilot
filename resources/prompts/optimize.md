---
title: "Optimize Performance"
icon: "⚡"
category: "Refactor"
command: "optimize"
description: "Optimize code for specific performance goals"
source: builtin
version: 2
variables:
  goal:
    type: select
    options: ["Speed", "Memory", "Bundle size", "DB queries", "All"]
    default: "All"
  code:
    type: file
    placeholder: "Select files to optimize…"
---

Please analyze and optimize the following code for **{{goal}}** performance.

{{code}}

Your optimization should:

1. **Identify Performance Bottlenecks**:
   - Analyze algorithmic complexity (Big O)
   - Identify expensive operations in loops
   - Spot unnecessary computations or allocations
   - Find blocking I/O or synchronous operations that could be async
   - Detect redundant database queries or N+1 query problems (if applicable)
   - Identify large dependencies or unused imports (for bundle size)

2. **Apply Optimizations** based on the goal:
   - **Speed**: Reduce time complexity, cache results, use more efficient algorithms/data structures, parallelize work, avoid unnecessary re-renders (React)
   - **Memory**: Reduce allocations, reuse objects, stream large data, avoid memory leaks, use WeakMap/WeakSet
   - **Bundle size**: Tree-shake unused code, lazy load modules, replace heavy dependencies, use native APIs
   - **DB queries**: Batch queries, add indexes, use joins instead of N+1, implement caching, optimize query patterns
   - **All**: Balance improvements across all dimensions

3. **Measure Impact**:
   - Estimate or measure the before/after performance improvement
   - Use profiling data if available
   - Provide benchmark code or measurement strategy
   - Note any trade-offs (e.g., speed vs. memory, readability vs. performance)

4. **Preserve Correctness**:
   - Ensure optimizations don't change behavior
   - Maintain readability where possible
   - Add comments explaining non-obvious optimizations
   - Suggest where to add performance tests

For each optimization:
- Explain what you changed
- Quantify the improvement (or explain how to measure it)
- Note any caveats or edge cases
- Indicate if the optimization is premature (not worth the complexity)

Provide the optimized code with detailed commentary on the changes.
