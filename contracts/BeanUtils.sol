pragma solidity ^0.8.14;

library BeanUtils {
    function swapPop(address[] storage self, uint256 index) internal {
        self[index] = self[self.length-1];
        self.pop();
    }
}