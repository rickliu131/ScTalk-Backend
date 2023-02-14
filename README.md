# ScTalk-Backend
Backend code for <a href='https://github.com/rickliu131/ScTalk'>ScTalk</a>

# Implementation
Express.js + Socket.IO

# Usage
1. Clone the code to local. `cd` to the cloned directory.<br>
2. `npm install`<br>
3. `mkdir tls`<br>Make a directory `tls` to store your TLS certificate and key.
4. Place your TLS certificate and key to the `tls` directory.
5. Edit `tls.js`.<br>Change `cert` and `key` in `module.exports` to the filenames of your certificate and key.
6. `nodemon app.js`<br>Start running the back-end program using `nodemon` (listening on port `443`)
