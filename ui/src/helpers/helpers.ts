const deepEqual = (obj1: any, obj2: any) => {

    if (obj1 == null || obj2 == null) {
        return obj1 == null && obj2 == null;
    }

    if (obj1 === obj2) // it's just the same object. No need to compare.
        return true;

    if (isPrimitive(obj1) && isPrimitive(obj2)) // compare primitives
        return obj1 === obj2;

    if (Object.keys(obj1).length !== Object.keys(obj2).length)
        return false;

    // compare objects with same number of keys
    for (let key in obj1) {
        if (!(key in obj2)) return false; //other object doesn't have this prop
        if (!deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
}

//check if value is primitive
const isPrimitive = (obj: any) => {
    return (obj !== Object(obj));
}

const sha512 = (str: string) => {
    return crypto.subtle.digest("SHA-512", new TextEncoder().encode(str)).then(buf => {
        return Array.prototype.map.call(new Uint8Array(buf), x => (('00' + x.toString(16)).slice(-2))).join('');
    });
}

export { deepEqual, isPrimitive, sha512 };