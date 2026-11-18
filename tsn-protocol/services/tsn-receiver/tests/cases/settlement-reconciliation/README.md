# settlement-reconciliation fixture components

The [discovery facade](../../settlement-reconciliation.test.mjs) retains the original test names and registrations. [COMPONENTS.json](COMPONENTS.json) records every authored test, fixture helper and callback, its original source line and its explicit captured context.

Each source file contains one authored implementation. Related callbacks receive a shared fixture context where the original closure observed later assignments; separate lexical declarations receive separate context fields. The existing assertions, temporary storage boundaries, stub modules and restoration steps remain in these fixtures. Source and offline fixture checks do not establish live service or chain execution.
