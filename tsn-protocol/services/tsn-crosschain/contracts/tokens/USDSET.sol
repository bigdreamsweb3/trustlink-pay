// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title USDSET
/// @notice Research-only mintable settlement test asset. The contract is intentionally
///         mintable by its owner so test liquidity can be issued without
///         pretending that the asset is an official Circle or Tether token.
/// @dev A future USD-backed USDSET deployment must use a separately governed
///      issuer, reserve, redemption, and audit policy.
contract USDSET is ERC20, Ownable {
    error ZeroAmount();

    constructor(address initialOwner) ERC20("TSN Dollar Settlement", "USDSET") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0) || amount == 0) revert ZeroAmount();
        _mint(recipient, amount);
    }

    function burn(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);
    }
}
