# Node test components

The discoverable `test_*.py` modules retain their existing unittest classes and helper exports. They assign methods imported from `cases/<suite>/functions/`, where each Python source file defines one function. This preserves test identities, standard discovery and cross-suite fixture imports.

Nested callbacks receive their captured values explicitly. `SharedValue` holds the two mutable counters that previously used `nonlocal`, so callbacks and their parent assertions observe the same updates. Suite data modules contain shared fixture values; origin modules locate the original test file for existing circuit and script references.

`COMPONENTS.json` maps each component to its original suite, function name and source line. The existing test commands and four opt-in proof checks keep their previous behavior.

The new [aggregate-prover dependency tests](epoch_prover_dependencies/README.md) verify explicit witness/proof handoff and current lease/version gates. Their dedicated functions and discovery shell are additional coverage; the original component map retains its pre-refactor provenance.
