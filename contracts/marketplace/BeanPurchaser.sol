pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract BeanPurchaser is Ownable {

    uint public threshold = 0;
    bool public autobuy = false;
    address public beans = 0x65b09ef8c5A096C5Fd3A80f1F7369E56eB932412;
    address public destination = 0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;
    IUniswapV2Router02 public uniswapV2Router = IUniswapV2Router02(0x96b244391D98B62D19aE89b1A4dCcf0fc56970C7);

    receive() external payable {
        if (autobuy) {
            buyBack();
        }
    }

    function buyBack() public {
        uint currentBalance = address(this).balance;
        if (currentBalance >= threshold) {
            // generate the uniswap pair path of token -> weth
            address[] memory path = new address[](2);
            path[0] = uniswapV2Router.WETH();
            path[1] = beans;

            // make the swap
            uniswapV2Router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: currentBalance}(
                0, // accept any amount of BEANS
                path,
                destination,
                block.timestamp
            );
        }
    }

    //ADMIN
    function setTokenAddress(address _token) external onlyOwner {
        beans = _token;
    }

    function setDestinationAddress(address _destination) external onlyOwner {
        destination = _destination;
    }

    function setThreshold(uint _threshold) external onlyOwner {
        threshold = _threshold;
    }

    function setRouterAdress(address _router) external onlyOwner {
        uniswapV2Router = IUniswapV2Router02(_router);
    }

    function recoverToken(address _token, uint256 amount) external onlyOwner {
        IERC20(_token).transfer(owner(), amount);
    }

    function recover(address to, uint256 amount) external onlyOwner {
        payable(to).transfer(amount);
    }


}