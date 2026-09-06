// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SnakeStackClaim — $PONS reward vault. User claims on-chain and pays their own gas.
/// @notice Backend holds the signer key and issues short-lived signatures over
///         (claimant, amount, nonce, deadline). The contract only verifies + pays.
///         Binding: chainid + vault address are part of the signed message,
///         so a signature cannot be replayed on another chain or vault.
contract SnakeStackClaim is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    /// @notice Reward token paid out by this vault ($PONS).
    IERC20 public immutable pons;

    /// @notice Backend signer address. Rotate with setSigner if ever leaked.
    address public signer;

    /// @notice Lifetime cap per wallet, in PONS base units. 0 = no cap.
    uint256 public maxPerWallet;

    bool public paused;

    /// @notice Next expected nonce per wallet (strict ordering, anti-replay).
    mapping(address => uint256) public nonces;
    /// @notice Total claimed per wallet, in PONS base units.
    mapping(address => uint256) public claimed;

    event Claimed(address indexed user, uint256 amount, uint256 nonce);
    event Funded(address indexed from, uint256 amount);
    event Swept(address indexed to, uint256 amount);
    event SignerUpdated(address indexed signer);
    event CapUpdated(uint256 maxPerWallet);
    event PausedSet(bool paused);

    error IsPaused();
    error BadSig();
    error Expired();
    error BadNonce();
    error OverCap();
    error Zero();
    error Underfunded();

    constructor(address _pons, address _signer, uint256 _maxPerWallet) Ownable(msg.sender) {
        if (_pons == address(0) || _signer == address(0)) revert Zero();
        pons = IERC20(_pons);
        signer = _signer;
        maxPerWallet = _maxPerWallet;
    }

    /// @notice Claim vested rewards. Callable by anyone, tokens always go to the signed claimant.
    /// @param amount PONS base units (raw token units, NOT game points).
    /// @param nonce Must equal nonces[claimant].
    /// @param deadline Unix timestamp after which the signature is worthless.
    /// @param sig Backend signature over (chainid, vault, claimant, amount, nonce, deadline).
    function claim(address claimant, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata sig) external {
        if (paused) revert IsPaused();
        if (block.timestamp > deadline) revert Expired();
        if (nonce != nonces[claimant]) revert BadNonce();
        if (amount == 0) revert Zero();
        if (maxPerWallet > 0 && claimed[claimant] + amount > maxPerWallet) revert OverCap();
        if (pons.balanceOf(address(this)) < amount) revert Underfunded();

        bytes32 digest = keccak256(
            abi.encodePacked(block.chainid, address(this), claimant, amount, nonce, deadline)
        ).toEthSignedMessageHash();
        if (digest.recover(sig) != signer) revert BadSig();

        nonces[claimant] = nonce + 1;
        claimed[claimant] += amount;
        emit Claimed(claimant, amount, nonce);
        pons.safeTransfer(claimant, amount);
    }

    /// @notice Pull PONS from the caller into the vault (requires prior approve).
    function fund(uint256 amount) external {
        if (amount == 0) revert Zero();
        pons.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    // ---- owner ----
    function setSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert Zero();
        signer = _signer;
        emit SignerUpdated(_signer);
    }

    function setCap(uint256 _maxPerWallet) external onlyOwner {
        maxPerWallet = _maxPerWallet;
        emit CapUpdated(_maxPerWallet);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    /// @notice Recover leftover PONS (or rotate funds). Only owner.
    function sweep(address to, uint256 amount) external onlyOwner {
        if (to == address(0) || amount == 0) revert Zero();
        pons.safeTransfer(to, amount);
        emit Swept(to, amount);
    }
}
