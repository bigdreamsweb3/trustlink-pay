"""SparseTree public class with explicit method implementations."""
from __future__ import annotations
from settlement.witness.sparse_tree_init import __init__ as SparseTree_init
from settlement.witness.sparse_tree_siblings import siblings as SparseTree_siblings

class SparseTree:
    __init__ = SparseTree_init

    siblings = SparseTree_siblings
