import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from app import app, db, User

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client
        with app.app_context():
            db.drop_all()

def test_register_login(client):
    rv = client.post('/register', data={'username': 'alice', 'password': 'pw'}, follow_redirects=True)
    assert rv.status_code == 200
    rv = client.post('/login', data={'username': 'alice', 'password': 'pw'}, follow_redirects=True)
    assert b'Tasks' in rv.data


def test_stats_page(client):
    client.post('/register', data={'username': 'bob', 'password': 'pw'}, follow_redirects=True)
    client.post('/login', data={'username': 'bob', 'password': 'pw'}, follow_redirects=True)
    rv = client.get('/stats')
    assert rv.status_code == 200
