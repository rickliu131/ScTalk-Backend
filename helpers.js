module.exports = {
  // generate a random number of size n (>0), returns in string
  genDigits: function (n) {
    return Math.floor((10**(n-1)) + Math.random()*9*(10**(n-1))).toString();
  },
  // extract the id of the room socket has joined, given a set of Socket.IO generated rooms (should only has 2 elements)
  extractRoomID: function (roomSet) {
    const it = roomSet.values();
    it.next(); // now points to first element (socket id), skip it
    return it.next().value; // now points to second element, roomID string
  },
  reportNoRoomJoinedError: function () {
    console.log('Error! No room joined.');
  }
};