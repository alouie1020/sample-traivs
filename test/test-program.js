'use strict';

const mongoose = require('mongoose');
const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');

const expect = chai.expect;

const { Program, User, Exercise } = require('../models');
const { app, runServer, closeServer } = require('../server');
const { TEST_DATABASE_URL } = require('../config');

chai.use(chaiHttp);

const authenticatedUser = chai.request.agent(app);
let userId;
let token;

function seedProgramData(user, exercise) {
    console.info('seeding program data');
    const seedData = [];

    for (let i = 0; i < 2; i++) {
        seedData.push(generateProgramData(user, exercise));
    }

    return Program.insertMany(seedData)
}

function seedExercise() {
    return Exercise.create({
        name: faker.lorem.words()
    })
}

function seedAuthor() {
    return User.create({
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
        userName: 'testuser',
        password: 'password'
    })
}

function generateProgramData(user, exercise) {
    return {
        programName: faker.lorem.words(),
        author: mongoose.Types.ObjectId(user._id),
        categories: ['legs', 'back', 'chest', 'biceps', 'triceps', 'shoulders', 'full body', 'cardio'],
        schedule: [
            {
                name: faker.lorem.words(),
                exercises: [
                    {
                        exercise: mongoose.Types.ObjectId(exercise._id),
                        sets: faker.random.number(),
                        reps: faker.random.number(),
                    }
                ]
            }
        ]
    }
}

function tearDownDb() {
    console.warn('Deleting Database');
    return mongoose.connection.dropDatabase();
}

describe.only('Program API resource', function () {
    before(function () {
        return runServer(TEST_DATABASE_URL);
    });

    beforeEach(function () {
        // sets up authentication (before each test runs, create a user and authenticate them)
        return chai.request(app)
            .post('/users/register')
            .send({
                firstName: 'test',
                lastName: 'user',
                userName: 'authuser',
                password: 'password'
            })
            .then(res => {
                expect(res).to.have.status(201);
                console.log('Registered user for Authentication: ', res.body)
            })
            .then(() => {
                return User
                    .findOne()
                    .then(user => {
                        userId = user.id;
                        console.log('userId global set to current user: ', userId)
                        console.log('typeof user Id: ', typeof userId);
                        const userCredentials = {
                            username: 'authuser',
                            password: 'password'
                        };

                        return userCredentials;
                    })
                    .then(userCredentials => {
                        console.log('posting credentials: ', userCredentials)
                        return authenticatedUser
                            .post('/auth/login')
                            .send(userCredentials)
                            .then(res => {
                                token = res.body.authToken;
                                console.log('token set to: ', token);
                                return token;
                            });
                    })
                    .catch(err => console.log(err))
            })
            .catch(err => console.log(err));
    })


    afterEach(function () {
        return tearDownDb();
    });

    after(function () {
        return closeServer();
    });

    describe.skip('GET endpoint', function () {
        // it('should find all programs according to queried field', function () {

        // })

        it('should return all existing programs', function () {
            return seedExercise()
                .then(exercise => {
                    console.log('seeding exercise')
                    return seedAuthor()
                        .then(author => ({ exercise, author }))
                })
                .then(({ exercise, author }) => seedProgramData(author, exercise))
                .then(() => {
                    return Program
                        .find()
                        .then(programs => console.log('programs: ', programs))
                })
                .then(() => {
                    let res;
                    return chai.request(app)
                        .get('/programs')
                        .set('Authorization', `Bearer ${token}`)
                        .then(_res => {
                            res = _res
                            expect(res).to.have.status(200);
                            expect(res.body).to.have.lengthOf.at.least(1);

                            return Program.count();
                        })
                        .then(count => {
                            expect(res.body).to.have.lengthOf(count);
                        })
                })
        })

        it('should return programs with the right fields', function () {
            let resProgram;
            return seedExercise()
                .then(exercise => {
                    console.log('seeding exercise')
                    return seedAuthor()
                        .then(author => ({ exercise, author }))
                })
                .then(({ exercise, author }) => seedProgramData(author, exercise))
                .then(() => {
                    return chai.request(app)
                        .get('/programs')
                        .set('Authorization', `Bearer ${token}`)
                        .then(res => {
                            expect(res).to.have.status(200);
                            expect(res).to.be.json;
                            expect(res.body).to.be.an('array');
                            expect(res.body).to.have.lengthOf.at.least(1);

                            res.body.forEach(program => {
                                expect(program).to.be.an('object');
                                expect(program).to.include.keys('id', 'programName', 'author', 'categories', 'schedule');
                                expect(program.schedule).to.have.lengthOf.at.least(1);
                            });

                            resProgram = res.body[0];
                            return Program.findById(resProgram.id)
                        })
                        .then(program => {
                            //console.log('program: ', program)
                            expect(resProgram.programName).to.equal(program.programName);
                            User
                                .findById(program.author)
                                .then(author => expect(resProgram.author).to.equal(author.userName));
                            expect(resProgram.categories).to.deep.equal(program.categories);

                            const exerciseIds = [];
                            program.schedule.forEach(day => {
                                day.exercises.forEach(exercise => {
                                    exerciseIds.push(exercise.exercise.toString())
                                });
                            })

                            return exerciseIds
                        })
                        .then(exerciseIds => {
                            console.log('resProgram: ', resProgram)
                            const resProgramIds = [];
                            resProgram.schedule.forEach(day => {
                                day.exercises.forEach(exercise => resProgramIds.push(exercise.exercise._id));
                            })
                            expect(exerciseIds).to.deep.equal(resProgramIds);
                        });
                })
        });
    })

    describe.skip('POST endpoint', function () {
        it('should add a new program', function () {

            return seedExercise()
                .then(() => {
                    return Exercise
                        .findOne()
                        .then(exercise => {
                            console.log('USER ID IN POST ENDPOINT TEST: ', userId)
                            const newProgram = {
                                programName: faker.lorem.words(),
                                author: userId,
                                categories: ['legs', 'back', 'chest'],
                                schedule: [
                                    {
                                        name: faker.lorem.words(),
                                        exercises: [
                                            {
                                                exercise: mongoose.Types.ObjectId(exercise._id),
                                                sets: faker.random.number(),
                                                reps: faker.random.number(),
                                            },
                                            {
                                                exercise: mongoose.Types.ObjectId(exercise._id),
                                                distance: faker.random.number(),
                                                time: faker.random.number(),
                                            }
                                        ]
                                    }
                                ]
                            }
                            //const newProgram = generateProgramData(authenticatedUser, exercise);
                            return newProgram
                        })
                        .then(newProgram => {
                            return chai.request(app)
                                .post('/programs')
                                .set('Authorization', `Bearer ${token}`)
                                .send(newProgram)
                                .then(function (res) {
                                    console.log('res.body: ', res.body);
                                    expect(res).to.have.status(201);
                                    expect(res).to.be.json;
                                    expect(res.body).to.be.an('object');
                                    expect(res.body).to.include.keys(
                                        'id', 'programName', 'categories', 'schedule');
                                    expect(res.body.id).to.not.be.null;
                                    expect(res.body.programName).to.equal(newProgram.programName);
                                    // author not included in response
                                    // expect(res.body.author).to.equal(newProgram.author.toString());
                                    expect(res.body.categories).to.deep.equal(newProgram.categories);
                                    expect(JSON.stringify(res.body.schedule)).to.equal(JSON.stringify(newProgram.schedule));

                                    return Program.findById(res.body.id);
                                })
                                .then(program => {
                                    expect(program.programName).to.equal(newProgram.programName);
                                    expect(program.author.toString()).to.equal(newProgram.author);
                                    expect(program.categories).to.deep.equal(newProgram.categories);
                                    // expect(JSON.stringify(program.schedule)).to.equal(JSON.stringify(newProgram.schedule));
                                });
                        })
                })

        });
    });

    describe('PUT endpoint', function () {
        // strategy:
        //  1. Get an existing post from db
        //  2. Make a PUT request to update that post
        //  4. Prove post in db is correctly updated
        it('should update a program name', function () {
            const updateProgram = {
                programName: 'new program name'
            };
            return seedExercise()
                .then(exercise => {
                    console.log('seeding exercise')
                    return seedAuthor()
                        .then(author => ({ exercise, author }))
                })
                .then(({ exercise, author }) => seedProgramData(author, exercise))
                .then(() => {
                    return Program
                        .find()
                        .then(programs => console.log('programs: ', programs))
                })
                .then(() => {
                    return chai.request(app)
                    .post('/programs')
                    .send(newProgram)
                    .then(() => {
                        return chai.request(app)
                            .put('/:id')
                    })


                    .then(function (res) {
                        expect(res).to.have.status(201);
                        expect(res).to.be.json;
                        expect(res.body).to.be.an('object');
                        expect(res.body).to.include.keys(
                            'id', 'programName', 'author', 'categories', 'schedule');
                        expect(res.body.id).to.not.be.null;
                        expect(res.body.programName).to.equal(newProgram.programName);
                        expect(res.body.author).to.equal(newProgram.author);
                        // expect(res.body.categories).to.equal(newProgram.categories);
                        // expect(res.body.schedule).to.equal(newProgram.schedule);
    
                        return Program.findById(res.body.id);
                    })
                    .then(function (program) {
                        expect(program.programName).to.equal(newProgram.programName);
                        expect(program.author).to.equal(newProgram.author);
                        expect(program.categories).to.equal(newProgram.categories);
                        expect(program.schedule).to.equal(newProgram.schedule);
                    });
                })
            
        });
    });

    describe.skip('DELETE endpoint', function () {
        it('should add a new program', function () {
            const newProgram = generateProgramData();

            return chai.request(app)
                .post('/programs')
                .send(newProgram)
                .then(function (res) {
                    expect(res).to.have.status(201);
                    expect(res).to.be.json;
                    expect(res.body).to.be.an('object');
                    expect(res.body).to.include.keys(
                        'id', 'programName', 'author', 'categories', 'schedule');
                    expect(res.body.id).to.not.be.null;
                    expect(res.body.programName).to.equal(newProgram.programName);
                    expect(res.body.author).to.equal(newProgram.author);
                    // expect(res.body.categories).to.equal(newProgram.categories);
                    // expect(res.body.schedule).to.equal(newProgram.schedule);

                    return Program.findById(res.body.id);
                })
                .then(function (program) {
                    expect(program.programName).to.equal(newProgram.programName);
                    expect(program.author).to.equal(newProgram.author);
                    expect(program.categories).to.equal(newProgram.categories);
                    expect(program.schedule).to.equal(newProgram.schedule);
                });
        });
    });
})