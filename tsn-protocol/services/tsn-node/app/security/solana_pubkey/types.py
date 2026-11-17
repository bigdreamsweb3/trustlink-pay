from __future__ import annotations

from dataclasses import dataclass
from .pubkey_post_init import __post_init__ as _Pubkey_post_init
from .pubkey_from_string import from_string as _Pubkey_from_string
from .pubkey_create_program_address import create_program_address as _Pubkey_create_program_address
from .pubkey_find_program_address import find_program_address as _Pubkey_find_program_address
from .pubkey_bytes import __bytes__ as _Pubkey_bytes
from .pubkey_str import __str__ as _Pubkey_str

@dataclass(frozen=True, slots=True)
class Pubkey:
    """A Solana 32-byte public key with the subset used by the TSN Node."""
    _bytes: bytes
    __post_init__ = _Pubkey_post_init
    from_string = classmethod(_Pubkey_from_string)
    create_program_address = classmethod(_Pubkey_create_program_address)
    find_program_address = classmethod(_Pubkey_find_program_address)
    __bytes__ = _Pubkey_bytes
    __str__ = _Pubkey_str
