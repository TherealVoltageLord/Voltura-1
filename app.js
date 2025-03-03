const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const usersFile = 'users.json';

function readUsers() {
    if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
    return JSON.parse(fs.readFileSync(usersFile));
}

function writeUsers(data) {
    fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
}

app.post('/register', (req, res) => {
    let users = readUsers();
    const { username, email, password, dob, gender, profilePic } = req.body;

    if (users.some(user => user.email === email || user.username === username)) {
        return res.status(400).json({ message: "User already exists" });
    }

    const birthYear = new Date(dob).getFullYear();
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;

    if (age < 16) {
        return res.status(403).json({ message: "You must be at least 16 years old to register." });
    }
    const newUser = { username, email, password, dob, gender, profilePic };
    users.push(newUser);
    writeUsers(users);

    res.status(201).json({ message: "Registration successful" });
});

app.post('/login', (req, res) => {
    let users = readUsers();
    const { email, password } = req.body;

    const user = users.find(user => user.email === email && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    res.status(200).json({ message: "Login successful", user });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
