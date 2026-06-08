# On-chain integration (Solidity)

The Escrow Generator is deployed on Ethereum mainnet. Your contract calls one create function, gets the escrow address, and calls methods on it.

## Create

```solidity
contract MyEscrowIntegration {
    address constant ESCROW_GENERATOR = 0xb381fB8e049C00B612fd060527dE0093DA1d6728;

    /// Creates an escrow, funds it, then reads state.
    function createAndFund(
        address _seller,
        uint256 _amount,
        uint256 _expiry
    ) external payable {
        (bool ok, bytes memory data) = ESCROW_GENERATOR.call(abi.encodeWithSignature(
            "createEscrow((bytes32,address,address,address,uint256,uint256,uint256,uint256,bytes32))",
            [bytes32(uint256(keccak256(abi.encode(block.timestamp, msg.sender)))),
             msg.sender, _seller, address(0), _amount, uint256(0),
             _expiry, uint256(0), bytes32(0)]
        ));
        require(ok);
        address escrow = abi.decode(data, (address));

        // Fund it
        (ok, ) = escrow.call{value: _amount}(abi.encodeWithSignature("deposit()"));
        require(ok);

        // Read state
        (ok, data) = escrow.staticcall(abi.encodeWithSignature("state()"));
        uint8 state = abi.decode(data, (uint8));
    }
}
```

The Escrow Generator address is the only thing you need. The rest is on the escrow.

