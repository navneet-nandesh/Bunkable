async function run() {
    try {
        const response = await fetch('https://bunkable-3.onrender.com/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': 'https://bunkable-fit.vercel.app' },
            body: JSON.stringify({ username: 'fakeuser', password: 'fakepass' })
        });
        console.log("Headers:");
        response.headers.forEach((value, name) => console.log(name, ":", value));
        const text = await response.text();
        console.log("Body:", text);
    } catch(e) {
        console.error(e);
    }
}
run();
