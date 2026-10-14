// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StablegramNames
/// @notice One @name per address, and one address per name. A wallet can claim directly.
///         A relayer can submit claimFor when the wallet signs and has no USDC for gas.
contract StablegramNames {
    mapping(bytes32 => address) public ownerOf;
    mapping(address => string) public handleOf;

    event Claimed(address indexed owner, bytes32 indexed nameHash, string name);

    error InvalidName();
    error NameTaken();
    error AddressHasName();
    error BadSignature();

    function claim(string calldata name) external {
        _claim(msg.sender, name);
    }

    function claimFor(address user, string calldata name, bytes calldata signature) external {
        bytes32 digest = _ethHash(bytes(messageFor(user, name)));
        if (_recover(digest, signature) != user || user == address(0)) revert BadSignature();
        _claim(user, name);
    }

    /// @dev The exact string the wallet signs. Address is lowercase hex.
    function messageFor(address user, string calldata name) public view returns (string memory) {
        return string.concat("Stablegram claim\n", _u256(block.chainid), "\n", _addr(user), "\n", name);
    }

    function _claim(address user, string calldata name) internal {
        if (!_valid(name)) revert InvalidName();
        bytes32 key = keccak256(bytes(name));
        if (ownerOf[key] != address(0)) revert NameTaken();
        if (bytes(handleOf[user]).length != 0) revert AddressHasName();
        ownerOf[key] = user;
        handleOf[user] = name;
        emit Claimed(user, key, name);
    }

    function _valid(string calldata name) internal pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length < 3 || raw.length > 20) return false;
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f;
            if (!ok) return false;
        }
        return true;
    }

    function _ethHash(bytes memory message) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", _u256(message.length), message));
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _addr(address user) internal pure returns (string memory) {
        bytes16 symbols = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 n = uint160(user);
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(n >> (8 * (19 - i)));
            out[2 + i * 2] = symbols[b >> 4];
            out[3 + i * 2] = symbols[b & 0x0f];
        }
        return string(out);
    }

    function _u256(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
