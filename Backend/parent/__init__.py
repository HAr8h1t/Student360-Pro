from flask import Blueprint

parent_bp = Blueprint('parent', __name__)

from . import routes
