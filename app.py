from datetime import datetime, timedelta
from flask import Flask, render_template, redirect, url_for, request
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import (
    LoginManager,
    login_user,
    login_required,
    logout_user,
    UserMixin,
    current_user,
)
from sqlalchemy import func

app = Flask(__name__)
app.config['SECRET_KEY'] = 'changeme'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///focusflow.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(150), nullable=False)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    description = db.Column(db.String(200))
    done = db.Column(db.Boolean, default=False)

class Session(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    duration = db.Column(db.Integer)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if User.query.filter_by(username=username).first():
            return 'User exists'
        user = User(username=username, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        return 'Invalid credentials'
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard', methods=['GET', 'POST'])
@login_required
def dashboard():
    if request.method == 'POST':
        description = request.form['description']
        task = Task(description=description, user_id=current_user.id)
        db.session.add(task)
        db.session.commit()
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    today = datetime.utcnow().date()
    total = (
        db.session.query(func.sum(Session.duration))
        .filter(Session.user_id == current_user.id, func.date(Session.timestamp) == today)
        .scalar()
        or 0
    )
    return render_template('dashboard.html', tasks=tasks, total=total // 60)


@app.route('/stats')
@login_required
def stats():
    start = datetime.utcnow().date() - timedelta(days=6)
    start_dt = datetime.combine(start, datetime.min.time())
    data = {start + timedelta(days=i): 0 for i in range(7)}
    rows = (
        db.session.query(func.date(Session.timestamp), func.sum(Session.duration))
        .filter(Session.user_id == current_user.id, Session.timestamp >= start_dt)
        .group_by(func.date(Session.timestamp))
        .all()
    )
    for day, total in rows:
        data[day] = total or 0
    labels = [d.strftime('%Y-%m-%d') for d in data.keys()]
    values = [v // 60 for v in data.values()]
    return render_template('stats.html', labels=labels, values=values)

@app.route('/task/<int:task_id>/toggle', methods=['POST'])
@login_required
def toggle_task(task_id):
    task = Task.query.get_or_404(task_id)
    if task.user_id != current_user.id:
        return 'Forbidden', 403
    task.done = not task.done
    db.session.commit()
    return redirect(url_for('dashboard'))

@app.route('/session', methods=['POST'])
@login_required
def record_session():
    duration = int(request.form['duration'])
    s = Session(user_id=current_user.id, duration=duration)
    db.session.add(s)
    db.session.commit()
    return 'OK', 201

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000)
