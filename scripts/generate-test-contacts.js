#!/usr/bin/env node

/**
 * Generate test contact data for import testing
 * Usage:
 *   node generate-test-contacts.js 100 > test-100.json
 *   node generate-test-contacts.js 1000 csv > test-1000.csv
 */

const count = parseInt(process.argv[2]) || 100;
const format = process.argv[3] || 'json';

const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Jennifer', 'William', 'Jessica'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
const companies = ['Acme Corp', 'TechStart Inc', 'Global Solutions', 'Innovation Labs', 'Digital Dynamics', 'Future Systems'];
const titles = ['CEO', 'CTO', 'Manager', 'Director', 'VP Sales', 'Engineer', 'Consultant', 'Analyst'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego'];
const states = ['NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'TX', 'CA'];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateContact(index) {
  const firstName = random(firstNames);
  const lastName = random(lastNames);

  return {
    first_name: firstName,
    last_name: lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${index}@example.com`,
    phone: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
    company: random(companies),
    title: random(titles),
    city: random(cities),
    state: random(states),
    address_line1: `${Math.floor(Math.random() * 9999) + 1} Main St`,
    postal_code: `${Math.floor(Math.random() * 90000) + 10000}`
  };
}

const contacts = [];
for (let i = 1; i <= count; i++) {
  contacts.push(generateContact(i));
}

if (format === 'json') {
  console.log(JSON.stringify(contacts, null, 2));
} else if (format === 'csv') {
  // CSV output
  console.log('First Name,Last Name,Email,Phone,Company,Title,Address,City,State,Postal Code');
  contacts.forEach(c => {
    console.log(`"${c.first_name}","${c.last_name}","${c.email}","${c.phone}","${c.company}","${c.title}","${c.address_line1}","${c.city}","${c.state}","${c.postal_code}"`);
  });
}
