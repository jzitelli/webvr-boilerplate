"""

"""

import os
import json
import logging
_logger = logging.getLogger(__name__)

from flask import Flask, render_template, request, jsonify, Markup

import sys
STATIC_FOLDER = os.path.abspath(os.path.join(os.path.split(__file__)[0], os.path.pardir))
app = Flask(__name__,
            static_folder=STATIC_FOLDER,
            #template_folder=STATIC_FOLDER,
            static_url_path='')
app.debug = True



@app.route('/')
def index():
    return render_template('index.html')



@app.route("/read")
def read():
    """Handles requests to read file contents"""
    filename = os.path.join(STATIC_FOLDER, request.args['file'])
    response = {}
    try:
        with open(filename, 'r') as f:
            response['text'] = f.read()
    except Exception as err:
        response['error'] = str(err)
    return jsonify(response)



WRITE_FOLDER = os.path.join(STATIC_FOLDER, 'write')
@app.route("/write", methods=['POST'])
def write():
    if not os.path.exists(WRITE_FOLDER):
        #raise Exception('write is disabled, you need to create the write folder %s' % WRITE_FOLDER)
        response = {'error': 'write is disabled, you need to create the write folder %s' % WRITE_FOLDER}
    else:
        filename = os.path.join(WRITE_FOLDER, os.path.split(request.args['file'])[1])
        try:
            if request.json is not None:
                with open(filename, 'w') as f:
                    f.write(json.dumps(request.json))
            else:
                with open(filename, 'w') as f:
                    f.write(request.form['text'])
            _logger.info('wrote %s' % filename)
            response = {'filename': filename}
        except Exception as err:
            response = {'error': str(err)}
    return jsonify(response)



@app.route('/log', methods=['POST'])
def log():
    """Post message from client to the server log
    """
    msg = request.form['msg']
    _logger.info(msg)
    response = {'status': 0}
    return jsonify(response)



def main():
    _logger.info("app.config:\n%s" % '\n'.join(['%s: %s' % (k, str(v))
                                                for k, v in sorted(app.config.items(),
                                                                   key=lambda i: i[0])]))
    _logger.info(r"""
            ------
   **************************
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
STARTING FLASK APP!!!!!!!!!!!!!
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  **************************
            ------
""")
    app.run(host='0.0.0.0')



if __name__ == "__main__":
    logging.basicConfig(level=(logging.DEBUG if app.debug else logging.INFO),
                        format="%(levelname)s %(name)s %(funcName)s %(lineno)d:  %(message)s")
    main()
