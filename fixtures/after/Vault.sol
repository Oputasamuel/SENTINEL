// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deliberately vulnerable test fixture. Never deploy with real funds.
contract Vault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(address owner, uint256 amount) external {
        require(msg.sender == owner, "owner");
        require(balances[owner] >= amount, "balance");
        balances[owner] -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer");
    }

    function emergencyExit(address owner) external {
        uint256 amount = balances[owner];
        balances[owner] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer");
    }
}
