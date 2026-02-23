---
title: "Architecture Review"
icon: "🏗️"
category: "Explain"
command: "arch"
description: "Review system architecture and design"
source: builtin
version: 1
---

Please review the architecture and design described below. I need feedback on the overall system design, identifying potential issues and suggesting improvements.

**Architecture Description**:
{{description}}

Your review should evaluate:

1. **High-Level Design**:
   - Is the overall architecture sound and appropriate for the problem?
   - Are components well-defined with clear responsibilities?
   - Is there a clear separation of concerns (business logic, data access, presentation)?
   - Does the design support the stated requirements and use cases?
   - Are there any missing components or layers?

2. **Scalability & Performance**:
   - Will this architecture scale horizontally and/or vertically?
   - Are there bottlenecks (database, API limits, single points of failure)?
   - How will it handle increased load, traffic spikes, or growth?
   - Are caching, queuing, or other performance patterns used appropriately?
   - What are the latency and throughput implications?

3. **Maintainability & Extensibility**:
   - Is the design modular and loosely coupled?
   - Can components be developed, tested, and deployed independently?
   - How easy is it to add new features or modify existing ones?
   - Are there clear boundaries and contracts between components?
   - Is there too much or too little abstraction?

4. **Reliability & Resilience**:
   - How does the system handle failures (network, service, database)?
   - Are there single points of failure?
   - What are the disaster recovery and backup strategies?
   - How are errors and retries handled?
   - Is there proper monitoring, logging, and alerting?

5. **Security**:
   - Is the attack surface minimized?
   - Are authentication and authorization designed correctly?
   - Is sensitive data protected (encryption, access control)?
   - Are there security boundaries between components?
   - How are secrets and credentials managed?

6. **Data Architecture**:
   - Is the data model appropriate (relational, document, graph, etc.)?
   - How is data consistency maintained?
   - What are the backup, replication, and recovery strategies?
   - Are there concerns about data migration or schema evolution?
   - Is there a clear data flow and ownership?

7. **Operational Concerns**:
   - How is the system deployed and configured?
   - What are the infrastructure and cloud dependencies?
   - How are rollouts, rollbacks, and blue-green deployments handled?
   - What are the cost implications of this architecture?
   - Are there vendor lock-in risks?

8. **Trade-offs & Alternatives**:
   - What are the key trade-offs in this design?
   - Are there simpler or more standard approaches?
   - Where is complexity justified, and where might it be reduced?
   - Are there industry-standard patterns or reference architectures to consider?

Provide:
- An overall assessment of the architecture
- Specific issues or red flags with severity ratings (🔴 Critical, 🟠 High, 🟡 Medium)
- Concrete recommendations for improvements
- Alternative approaches if the current design has fundamental issues
- Questions to clarify requirements or constraints

If the architecture is solid, highlight what was done well and any particularly clever design decisions.
